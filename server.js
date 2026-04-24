const fs = require("fs");
const path = require("path");

const dotenv = require("dotenv");
const express = require("express");
const OpenAI = require("openai");
const { parse } = require("csv-parse/sync");

dotenv.config();

const app = express();
const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const JSON_CATALOG_PATH = path.join(ROOT_DIR, "shiseido-catalog.json");
const CSV_CATALOG_PATH = path.join(ROOT_DIR, "Skincare _ SHISEIDO.csv");
const FALLBACK_CATALOG_PATH = path.join(ROOT_DIR, "mock-beauty-catalog.json");

const AGENT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sentiment: {
      type: "string",
      enum: ["frustrated", "uncertain", "excited", "neutral"],
    },
    shopperGoal: {
      type: "string",
    },
    reply: {
      type: "string",
    },
    needsFollowup: {
      type: "boolean",
    },
    followupQuestion: {
      type: "string",
    },
    recommendedProductIds: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
  required: [
    "sentiment",
    "shopperGoal",
    "reply",
    "needsFollowup",
    "followupQuestion",
    "recommendedProductIds",
  ],
};

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.use((request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: "1mb" }));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePrice(value) {
  if (value == null) return null;
  const normalized = String(value).replace(/[^0-9.]/g, "");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumber(value) {
  if (value == null) return null;
  const normalized = String(value).replace(/[^0-9.]/g, "");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeJsonParse(value, fallbackValue) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallbackValue;
  }
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;|]/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function uniqueList(values = []) {
  return [...new Set(values.map((item) => cleanText(item)).filter(Boolean))];
}

function inferConcerns(product) {
  if (Array.isArray(product.concerns) && product.concerns.length > 0) {
    return product.concerns.map((item) => cleanText(item)).filter(Boolean);
  }

  const source = `${product.description || ""} ${product.overview_summary || ""}`.toLowerCase();
  const knownConcerns = [
    "wrinkles",
    "fine lines",
    "dark spots",
    "dullness",
    "dryness",
    "hydration",
    "sun protection",
    "redness",
    "pores",
    "texture",
    "firming",
    "acne",
    "sensitivity",
    "dark circles",
  ];

  return knownConcerns.filter((concern) => source.includes(concern));
}

function normalizeCatalogProduct(product, index = 0) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const firstVariant = variants[0] || {};
  const price =
    parseNumber(product.price) ??
    parseNumber(product.price_current) ??
    parseNumber(firstVariant.sale_price) ??
    parseNumber(firstVariant.standard_price) ??
    0;

  const collections = Array.isArray(product.collections)
    ? product.collections.map((item) => cleanText(item)).filter(Boolean)
    : splitList(product.Collection);

  const categories = Array.isArray(product.categories)
    ? product.categories.map((item) => cleanText(item)).filter(Boolean)
    : splitList(product.category);

  const benefits = Array.isArray(product.benefits)
    ? product.benefits.map((item) => cleanText(item)).filter(Boolean)
    : [];

  const features = Array.isArray(product.features)
    ? product.features.map((item) => cleanText(item)).filter(Boolean)
    : splitList(product.results);

  const promotions = Array.isArray(product.promotions)
    ? product.promotions.map((item) => cleanText(item)).filter(Boolean)
    : splitList(product.Promotions);

  const imageGallery = Array.isArray(product.image_gallery)
    ? product.image_gallery.filter(Boolean)
    : [];

  const id =
    cleanText(product.id) ||
    cleanText(firstVariant.variant_id) ||
    `catalog-${slugify(product.name || product.product_title || `item-${index + 1}`)}`;

  return {
    ...product,
    id,
    name: cleanText(product.name || product.product_title || `Product ${index + 1}`),
    category: cleanText(product.category || categories[0] || "Skincare"),
    product_type: cleanText(product.product_type || categories[0] || "beauty"),
    price,
    msrp:
      parseNumber(product.msrp) ??
      parseNumber(firstVariant.standard_price) ??
      parseNumber(product.price_current) ??
      price,
    rating: parseNumber(product.rating) ?? parseNumber(product.star_rating),
    reviews: parseNumber(product.reviews) ?? parseNumber(product.review_count),
    description: cleanText(product.description || product.overview_summary || product.overview),
    composition: cleanText(product.composition || product.Text),
    how_to_use: cleanText(product.how_to_use),
    results_timeline: cleanText(product.results_timeline || product.results),
    overview: cleanText(product.overview),
    overview_summary: cleanText(product.overview_summary),
    collections,
    categories,
    concerns: inferConcerns(product),
    benefits,
    features,
    ingredients: Array.isArray(product.ingredients)
      ? product.ingredients.map((item) => cleanText(item)).filter(Boolean)
      : [],
    image_url: cleanText(product.image_url || product.URL_Saved_To),
    image_gallery: imageGallery,
    coupon_applicable: cleanText(product.coupon_applicable || product.Coupon_Applicable),
    promotions,
  };
}

function loadCatalogFromJson(filePath) {
  const raw = readJson(filePath);
  const products = Array.isArray(raw.products) ? raw.products : [];
  return products.map((product, index) => normalizeCatalogProduct(product, index));
}

function loadCatalogFromCsv(filePath) {
  const csvText = fs.readFileSync(filePath, "utf8");
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  const normalizedProducts = rows
    .map((row, index) => {
      const variants = safeJsonParse(row.variants, []);
      const title = cleanText(row.Name || row.product_title);
      if (!title) return null;

      return normalizeCatalogProduct(
        {
          id: cleanText(row.Name_URL) || cleanText(variants[0]?.variant_id),
          name: title,
          category: cleanText(row.category || "Skincare"),
          product_type: cleanText(row.category || "Skincare"),
          price_current: row.price_current,
          star_rating: row.star_rating,
          reviews: row.Reviews,
          description: row.Description,
          composition: row.Text,
          how_to_use: row.how_to_use,
          results_timeline: row.results,
          overview: row.overview,
          overview_summary: row.overview_summary,
          variants,
          collections: splitList(row.Collection),
          categories: splitList(row.category),
          image_url: row.URL_Saved_To,
          coupon_applicable: row.Coupon_Applicable,
          promotions: splitList(row.Promotions),
        },
        index
      );
    })
    .filter(Boolean);

  const deduped = new Map();
  normalizedProducts.forEach((product) => {
    const dedupeKey =
      cleanText(product.variants?.[0]?.variant_id) ||
      cleanText(product.id) ||
      cleanText(product.name).toLowerCase();
    const existing = deduped.get(dedupeKey);
    if (!existing) {
      deduped.set(dedupeKey, {
        ...product,
        image_gallery: uniqueList([product.image_url, ...(product.image_gallery || [])]),
      });
      return;
    }

    deduped.set(dedupeKey, {
      ...existing,
      description:
        existing.description.length >= product.description.length
          ? existing.description
          : product.description,
      composition:
        existing.composition.length >= product.composition.length
          ? existing.composition
          : product.composition,
      how_to_use:
        existing.how_to_use.length >= product.how_to_use.length
          ? existing.how_to_use
          : product.how_to_use,
      overview:
        existing.overview.length >= product.overview.length ? existing.overview : product.overview,
      overview_summary:
        existing.overview_summary.length >= product.overview_summary.length
          ? existing.overview_summary
          : product.overview_summary,
      image_gallery: uniqueList([
        ...(existing.image_gallery || []),
        existing.image_url,
        ...(product.image_gallery || []),
        product.image_url,
      ]),
      promotions: uniqueList([...(existing.promotions || []), ...(product.promotions || [])]),
    });
  });

  return [...deduped.values()];
}

function mergeCatalogProducts(primaryProducts, csvProducts) {
  const csvByName = new Map(
    csvProducts.map((product) => [cleanText(product.name).toLowerCase(), product])
  );

  return primaryProducts.map((product) => {
    const csvMatch = csvByName.get(cleanText(product.name).toLowerCase());
    if (!csvMatch) return product;

    return {
      ...product,
      description:
        product.description && product.description.length >= csvMatch.description.length
          ? product.description
          : csvMatch.description,
      composition: product.composition || csvMatch.composition,
      how_to_use: product.how_to_use || csvMatch.how_to_use,
      overview: product.overview || csvMatch.overview,
      overview_summary: product.overview_summary || csvMatch.overview_summary,
      results_timeline: product.results_timeline || csvMatch.results_timeline,
      features: uniqueList([...(product.features || []), ...(csvMatch.features || [])]),
      benefits: uniqueList([...(product.benefits || []), ...(csvMatch.benefits || [])]),
      concerns: uniqueList([...(product.concerns || []), ...(csvMatch.concerns || [])]),
      categories: uniqueList([...(product.categories || []), ...(csvMatch.categories || [])]),
      collections: uniqueList([...(product.collections || []), ...(csvMatch.collections || [])]),
      ingredients:
        Array.isArray(product.ingredients) && product.ingredients.length
          ? product.ingredients
          : csvMatch.ingredients,
      image_gallery: uniqueList([
        ...(product.image_gallery || []),
        ...(csvMatch.image_gallery || []),
      ]),
      coupon_applicable: product.coupon_applicable || csvMatch.coupon_applicable,
      promotions: uniqueList([...(product.promotions || []), ...(csvMatch.promotions || [])]),
    };
  });
}

function loadCatalog() {
  if (fs.existsSync(JSON_CATALOG_PATH) && fs.existsSync(CSV_CATALOG_PATH)) {
    const jsonProducts = loadCatalogFromJson(JSON_CATALOG_PATH);
    const csvProducts = loadCatalogFromCsv(CSV_CATALOG_PATH);
    return {
      source: `${path.basename(JSON_CATALOG_PATH)} + ${path.basename(CSV_CATALOG_PATH)}`,
      products: mergeCatalogProducts(jsonProducts, csvProducts),
    };
  }

  if (fs.existsSync(JSON_CATALOG_PATH)) {
    return {
      source: path.basename(JSON_CATALOG_PATH),
      products: loadCatalogFromJson(JSON_CATALOG_PATH),
    };
  }

  if (fs.existsSync(CSV_CATALOG_PATH)) {
    return {
      source: path.basename(CSV_CATALOG_PATH),
      products: loadCatalogFromCsv(CSV_CATALOG_PATH),
    };
  }

  return {
    source: path.basename(FALLBACK_CATALOG_PATH),
    products: loadCatalogFromJson(FALLBACK_CATALOG_PATH),
  };
}

const catalogPayload = loadCatalog();
const catalog = catalogPayload.products;
const catalogById = new Map(catalog.map((product) => [product.id, product]));

function tokenize(value) {
  return cleanText(value)
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function getProductSearchBlob(product) {
  return [
    product.name,
    product.category,
    product.product_type,
    product.description,
    product.composition,
    product.how_to_use,
    product.results_timeline,
    ...(product.collections || []),
    ...(product.categories || []),
    ...(product.concerns || []),
    ...(product.benefits || []),
    ...(product.features || []),
    ...(product.ingredients || []),
    ...(product.promotions || []),
    product.coupon_applicable,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function applyActiveFilterScore(product, activeFilter) {
  switch (activeFilter) {
    case "under25":
      return product.price <= 25 ? 5 : -4;
    case "under50":
      return product.price <= 50 ? 4 : -3;
    case "bestRated":
      return (product.rating || 0) * 1.5;
    case "fragranceFree":
      return /fragrance/i.test(product.composition || "") ? -2 : 2;
    case "sensitive":
      return getProductSearchBlob(product).includes("sensitive") ? 3 : 0;
    case "vegan":
      return getProductSearchBlob(product).includes("vegan") ? 2 : 0;
    default:
      return 0;
  }
}

function applyIntentFilterScore(product, intentFilters) {
  const intent = intentFilters?.discoveryIntent || {};
  let score = 0;
  const blob = getProductSearchBlob(product);

  if (intent.product_category) {
    score += blob.includes(String(intent.product_category).toLowerCase()) ? 5 : -1;
  }
  if (intent.skin_type) {
    score += blob.includes(String(intent.skin_type).toLowerCase()) ? 4 : 0;
  }
  if (intent.concern) {
    score += blob.includes(String(intent.concern).toLowerCase()) ? 4 : 0;
  }
  if (intent.finish) {
    score += blob.includes(String(intent.finish).toLowerCase()) ? 2 : 0;
  }
  if (intent.coverage) {
    score += blob.includes(String(intent.coverage).toLowerCase()) ? 2 : 0;
  }
  if (intent.spf_min && product.description) {
    const spfMatch = product.description.match(/spf\s*(\d+)/i);
    const spf = spfMatch ? Number.parseInt(spfMatch[1], 10) : 0;
    score += spf >= intent.spf_min ? 3 : -1;
  }

  return score;
}

function inferRequestedCategory(query, intentFilters) {
  const explicitCategory = cleanText(intentFilters?.discoveryIntent?.product_category).toLowerCase();
  if (explicitCategory) return explicitCategory;

  const normalized = cleanText(query).toLowerCase();
  if (!normalized) return "";

  if (/\bcleanser|cleansing|face wash|wash\b/.test(normalized)) return "cleanser";
  if (/\bmoisturizer|moisturiser|cream\b/.test(normalized)) return "moisturizer";
  if (/\bserum\b/.test(normalized)) return "serum";
  if (/\bsunscreen|spf|sun protection\b/.test(normalized)) return "sunscreen";
  if (/\beye cream|eye care\b/.test(normalized)) return "eye care";
  if (/\btoner|softener\b/.test(normalized)) return "toner";

  return "";
}

function productMatchesRequestedCategory(product, requestedCategory) {
  if (!requestedCategory) return true;

  const taxonomyHaystack = [
    product.category,
    product.product_type,
    ...(product.categories || []),
    ...(product.collections || []),
    product.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  switch (requestedCategory) {
    case "cleanser":
      return /\bcleanser|cleansing|face wash|foam|oil cleanser|cleanse\b/.test(taxonomyHaystack);
    case "moisturizer":
      return /\bmoisturizer|moisturiser|cream|gel-cream|face moisturizers\b/.test(taxonomyHaystack);
    case "serum":
      return /\bserum|treatment\b/.test(taxonomyHaystack);
    case "sunscreen":
      return /\bsunscreen|spf|sun protection|face sunscreen|sun protector\b/.test(taxonomyHaystack);
    case "eye care":
      return /\beye cream|eye care|eye & lip care|eye creams\b/.test(taxonomyHaystack);
    case "toner":
      return /\btoner|softener\b/.test(taxonomyHaystack);
    default:
      return taxonomyHaystack.includes(requestedCategory);
  }
}

function productMatchesRefinementId(product, refinementId) {
  const blob = getProductSearchBlob(product);
  switch (refinementId) {
    case "gentle-sensitive":
      return /\bgentle|sensitive|non-stripping|soothing\b/.test(blob);
    case "removes-makeup":
      return /\bmakeup|waterproof|impurities|remove\b/.test(blob);
    case "dry-skin":
      return /\bdry|hydrat|moisture|barrier\b/.test(blob);
    case "oily-skin":
      return /\boily|oil control|pores|shine\b/.test(blob);
    case "fragrance-free":
      return /\bfragrance-free|unscented\b/.test(blob);
    case "best-rated":
      return Number(product.rating || 0) >= 4.5;
    case "lightweight-day":
      return /\blightweight|day|daily\b/.test(blob);
    case "rich-night":
      return /\brich|night|overnight\b/.test(blob);
    case "wrinkle-focused":
      return /\bwrinkle|anti-aging|fine lines\b/.test(blob);
    case "with-spf":
      return /\bspf|sun protection|sunscreen\b/.test(blob);
    case "good-under-makeup":
      return /\bunder makeup|makeup\b/.test(blob);
    case "invisible-finish":
      return /\binvisible finish|clear|no white cast|weightless\b/.test(blob);
    case "stick-reapply":
      return /\bstick|reapply|on-the-go\b/.test(blob);
    case "water-resistant":
      return /\bwater[- ]resistant\b|\bwetforce\b|\bsweat\b|\bsport\b/.test(blob);
    case "brightening":
      return /\bbrightening|radiance|glow|dullness|dark spots\b/.test(blob);
    case "hydrating":
      return /\bhydrat|moisture|plump\b/.test(blob);
    case "barrier-support":
      return /\bbarrier\b/.test(blob);
    case "fast-absorbing":
      return /\bfast-absorbing|absorbs quickly|quickly absorbs\b/.test(blob);
    case "dark-circles":
      return /\bdark circles\b/.test(blob);
    case "fine-lines":
      return /\bfine lines|wrinkle\b/.test(blob);
    case "am-routine":
      return /\bmorning|am routine|day\b/.test(blob);
    case "pm-repair":
      return /\bnight|pm repair|overnight\b/.test(blob);
    case "under-50":
      return Number(product.price || 0) <= 50;
    default:
      return true;
  }
}

function scoreProduct(product, options) {
  const { query, activeFilter, intentFilters } = options;
  const blob = getProductSearchBlob(product);
  const queryTokens = tokenize(query);

  let score = (product.rating || 0) * 0.5;

  for (const token of queryTokens) {
    if (!blob.includes(token)) continue;
    score += token.length >= 6 ? 2.2 : 1;
    if (product.name.toLowerCase().includes(token)) score += 1.5;
    if (product.category.toLowerCase().includes(token)) score += 1.25;
  }

  score += applyActiveFilterScore(product, activeFilter);
  score += applyIntentFilterScore(product, intentFilters);

  if (product.promotions?.length) score += 0.4;
  if (product.coupon_applicable) score += 0.2;

  return score;
}

function getRankedCandidates(options) {
  const requestedCategory = inferRequestedCategory(options.query, options.intentFilters);
  const refinementIds = Array.isArray(options.refinementIds) ? options.refinementIds.filter(Boolean) : [];
  const categoryPool = catalog.filter((product) =>
    productMatchesRequestedCategory(product, requestedCategory)
  );
  const candidatePool = refinementIds.length
    ? categoryPool.filter((product) =>
        refinementIds.every((refinementId) => productMatchesRefinementId(product, refinementId))
      )
    : categoryPool;

  if (refinementIds.length && candidatePool.length === 0) {
    return [];
  }

  const scored = (candidatePool.length > 0 ? candidatePool : catalog).map((product) => ({
    product,
    score: scoreProduct(product, options),
  }));

  const filtered = scored
    .sort((left, right) => right.score - left.score)
    .filter((item) => item.score > 0);

  if (filtered.length > 0) {
    return filtered.map((item) => item.product);
  }

  if (refinementIds.length) {
    return [];
  }

  return [...catalog]
    .sort((left, right) => (right.rating || 0) - (left.rating || 0))
    .slice(0, 12);
}

function buildPromptCandidates(products) {
  return products.slice(0, 12).map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    productType: product.product_type,
    price: product.price,
    rating: product.rating,
    concerns: product.concerns,
    benefits: product.benefits,
    collections: product.collections,
    coupon: product.coupon_applicable,
    promotions: product.promotions,
    description: product.description,
  }));
}

function inferSentimentFromQuery(query) {
  const normalized = cleanText(query).toLowerCase();
  if (!normalized) return "neutral";
  if (/\b(hate|annoyed|frustrated|angry|upset|confused|overwhelmed)\b/.test(normalized)) {
    return "frustrated";
  }
  if (/\b(not sure|maybe|help|unsure|don't know|confused)\b/.test(normalized)) {
    return "uncertain";
  }
  if (/\b(love|excited|amazing|perfect|great|wow)\b/.test(normalized)) {
    return "excited";
  }
  return "neutral";
}

function buildFallbackResponse(options, candidates, reason) {
  const topProducts = candidates.slice(0, options.maxResults || 5);
  const shopperGoal = cleanText(options.query) || "Find a good skincare match";
  const noProducts = topProducts.length === 0;

  return {
    mode: "fallback",
    sentiment: inferSentimentFromQuery(options.query),
    shopperGoal,
    reply: noProducts
      ? "I couldn't confidently recommend products yet. Tell me your main skincare concern, preferred product type, or budget."
      : `I found ${topProducts.length} relevant picks based on what you asked for${reason ? ` (${reason})` : ""}.`,
    needsFollowup: noProducts,
    followupQuestion: noProducts
      ? "What are you shopping for today: cleanser, serum, moisturizer, sunscreen, or eye care?"
      : "",
    recommendedProductIds: topProducts.map((product) => product.id),
    products: topProducts,
  };
}

async function buildAgentResponse(options) {
  const rankedCandidates = getRankedCandidates(options);

  if (!openai) {
    return buildFallbackResponse(options, rankedCandidates, "agent key not configured");
  }

  const promptCandidates = buildPromptCandidates(rankedCandidates);

  const systemPrompt = [
    "You are a premium beauty shopping assistant for a prototype ecommerce experience.",
    "Your job is to understand shopper intent and emotional tone, then recommend only from the provided candidate products.",
    "Do not invent products, prices, promotions, ingredients, or claims.",
    "Keep the reply concise, helpful, and sales-assistive.",
    "If the shopper intent is too broad or missing a crucial detail, set needsFollowup to true and ask exactly one short follow-up question.",
    "Only put product ids in recommendedProductIds if they exist in the provided candidate list.",
  ].join(" ");

  const userPayload = {
    shopperMessage: cleanText(options.query),
    activeFilter: options.activeFilter || "",
    refinementIds: Array.isArray(options.refinementIds) ? options.refinementIds : [],
    currentIntentFilters: options.intentFilters || null,
    recentConversation: (options.conversation || []).slice(-8),
    candidateProducts: promptCandidates,
  };

  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    store: false,
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Return JSON that matches the schema exactly.\n${JSON.stringify(userPayload)}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "shopper_agent_response",
        strict: true,
        schema: AGENT_RESPONSE_SCHEMA,
      },
    },
  });

  const outputText = response.output_text || "";
  const parsed = outputText ? JSON.parse(outputText) : null;

  if (!parsed) {
    return buildFallbackResponse(options, rankedCandidates, "empty model response");
  }

  const recommendedProductIds = Array.isArray(parsed.recommendedProductIds)
    ? parsed.recommendedProductIds.filter((id) => catalogById.has(id)).slice(0, options.maxResults || 5)
    : [];

  const products = recommendedProductIds.map((id) => catalogById.get(id)).filter(Boolean);
  const fallbackProducts = products.length > 0 ? products : rankedCandidates.slice(0, options.maxResults || 5);

  return {
    mode: "agent",
    sentiment: parsed.sentiment,
    shopperGoal: cleanText(parsed.shopperGoal) || cleanText(options.query),
    reply: cleanText(parsed.reply),
    needsFollowup: Boolean(parsed.needsFollowup),
    followupQuestion: cleanText(parsed.followupQuestion),
    recommendedProductIds:
      products.length > 0 ? products.map((product) => product.id) : fallbackProducts.map((product) => product.id),
    products: fallbackProducts,
  };
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    model: OPENAI_MODEL,
    catalogSource: catalogPayload.source,
    productCount: catalog.length,
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
});

app.get("/api/catalog", (_request, response) => {
  response.json({ products: catalog });
});

app.post("/api/chat", async (request, response) => {
  const query = cleanText(request.body?.query);
  if (!query) {
    response.status(400).json({ error: "A shopper message is required." });
    return;
  }

  try {
    const result = await buildAgentResponse({
      query,
      activeFilter: cleanText(request.body?.activeFilter),
      refinementIds: Array.isArray(request.body?.refinementIds) ? request.body.refinementIds : [],
      intentFilters: request.body?.intentFilters || null,
      conversation: Array.isArray(request.body?.conversation) ? request.body.conversation : [],
      maxResults: Math.min(Math.max(Number(request.body?.maxResults) || 5, 1), 10),
    });

    response.json(result);
  } catch (error) {
    console.error("Agent request failed", {
      message: error?.message,
      status: error?.status || error?.response?.status,
      code: error?.code,
      type: error?.type,
      name: error?.name,
    });
    const rankedCandidates = getRankedCandidates({
      query,
      activeFilter: cleanText(request.body?.activeFilter),
      refinementIds: Array.isArray(request.body?.refinementIds) ? request.body.refinementIds : [],
      intentFilters: request.body?.intentFilters || null,
      conversation: Array.isArray(request.body?.conversation) ? request.body.conversation : [],
    });

    response.json(buildFallbackResponse({ query, maxResults: 5 }, rankedCandidates, "agent unavailable"));
  }
});

app.use(express.static(ROOT_DIR));

app.use((_request, response) => {
  response.sendFile(path.join(ROOT_DIR, "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `Shopper agent server running on http://localhost:${PORT} using ${catalogPayload.source}${
        openai ? ` with model ${OPENAI_MODEL}` : " without OPENAI_API_KEY"
      }`
    );
  });
}

module.exports = { app };
