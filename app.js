const catalogPath = "shiseido-catalog.json";
const SHISEIDO_RETURNS_URL =
  "https://www.shiseido.com/us/en/customerservice?cid=returns";

const RETURN_POLICY_FOLLOWUPS = {
  "Can I return an empty box?":
    'Empty containers are not accepted for a refund. When returning a set or kit, all contents from the original set are required; partial items will not be refunded. <a href="' +
    SHISEIDO_RETURNS_URL +
    '" target="_blank" rel="noopener">Shiseido return policy</a>',
  "How long for a refund?":
    'After your return arrives, allow up to <strong>10 business days</strong> for processing. Refunds go to your original payment method (item + sales tax; shipping not refunded). You’ll get a confirmation email when done. <a href="' +
    SHISEIDO_RETURNS_URL +
    '" target="_blank" rel="noopener">Full details</a>',
};

const chatEl = document.getElementById("chat");
const searchInput = document.getElementById("searchInput");

/** True when device has coarse pointer (touch); used to try iOS switch haptic. */
const supportsTouchHaptics =
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/** Trigger haptic feedback when supported. Uses Vibration API on Android; on iOS Safari (18+) uses a one-off hidden switch click (same approach as ios-haptics). */
function triggerHaptic() {
  if (typeof navigator === "undefined") return;
  if (navigator.vibrate) {
    navigator.vibrate(10);
    return;
  }
  if (!supportsTouchHaptics || !document.head) return;
  try {
    const labelEl = document.createElement("label");
    labelEl.setAttribute("aria-hidden", "true");
    labelEl.style.display = "none";
    const inputEl = document.createElement("input");
    inputEl.type = "checkbox";
    inputEl.setAttribute("switch", "");
    labelEl.appendChild(inputEl);
    document.head.appendChild(labelEl);
    labelEl.click();
    document.head.removeChild(labelEl);
  } catch (_) {
    // ignore
  }
}
const searchButton = document.getElementById("searchButton");
const scrollToBottomBtn = document.getElementById("scrollToBottom");

let allProducts = [];
let activeFilter = null;
let lastQuery = "";
const conversation = [];
const selectedPlpProducts = new Map();
const MAX_COMPARE_PRODUCTS = 4;
let pendingGenderQuery = null;
let activeGender = null;
let askHikingFollowup = false;
let pendingIntentFilters = null;
let lastIntentFilters = null;
let pendingDurationQuery = null;
let pendingDurationFilters = null;
let pendingClimateQuery = null;
let pendingClimateFilters = null;
let pendingSupportQuery = null;
let pendingSupportFilters = null;
let selectedGenderLabel = null;
let selectedDurationLabel = null;
let selectedClimateLabel = null;
let selectedSupportLabel = null;
let lastDiscoveryIntent = null;
const cartState = {
  items: [],
  /** Item-level coupons: { [itemId]: string[] } (coupon codes per cart line) */
  appliedItemCoupons: {},
  /** Cart-level coupons: string[] (applied to subtotal) */
  appliedCartCoupons: [],
  /** Valid coupons added but not applicable yet (e.g. no qualifying items / order below min): shown as disabled pills, not used in totals */
  inactiveCoupons: [],
};
let applePayModal = null;
let applePayBreakdownModal = null;
const APPLE_PAY_MERCHANT_ID = "merchant.com.example";
const APPLE_PAY_MERCHANT_NAME = "Shiseido A/S";
const APPLE_PAY_MERCHANT_SITE = "us.shiseido.com";
const APPLE_PAY_COUNTRY = "US";
const APPLE_PAY_CURRENCY = "USD";

const fallbackPalette = [
  "#f7d9e4",
  "#f2e8ff",
  "#e5f3ff",
  "#fdf1d6",
  "#e8f7f1",
  "#fde0d9",
];

/** Light haptic feedback on supported devices (e.g. mobile). No-op when Vibration API is unavailable. */
function triggerHaptic() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

function formatPrice(value) {
  return `$${value.toFixed(0)}`;
}

function formatReviewCount(value) {
  if (value == null) return null;
  const parsed = Number.parseInt(String(value).replace(/,/g, ""), 10);
  if (Number.isNaN(parsed)) return null;
  return parsed.toLocaleString("en-US");
}

/** Strip "KEY BENEFITS" and variants from overview/summary text (matches CSV cleaning). */
function cleanKeyBenefitsFromSummary(text) {
  if (!text || typeof text !== "string") return text;
  let result = text
    .replace(/^(?:\s*KEY BENEFITS\s*[:\-]\s*)+/i, "")
    .replace(/(?:^|\n)\s*KEY BENEFITS\s*[:\-]?\s*/gi, "\n")
    .replace(/\s+KEY BENEFITS\s*[:\-]?\s*/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/  +/g, " ")
    .trim();
  return result;
}

function buildStarRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  const clamped = Math.max(0, Math.min(5, rating));
  const fullStars = Math.floor(clamped);
  const hasHalf = clamped - fullStars >= 0.5 && fullStars < 5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
  return { rating: clamped, fullStars, hasHalf, emptyStars };
}

function getFallbackImageUrl(label, seed = 0) {
  const safeLabel = (label || "Beauty pick").trim();
  const paletteIndex = Math.abs(hashString(`${safeLabel}-${seed}`)) % fallbackPalette.length;
  const bg = fallbackPalette[paletteIndex];
  const text = encodeURIComponent(safeLabel);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="480">
      <rect width="100%" height="100%" rx="28" fill="${bg}"/>
      <g fill="#1f1f1f" font-family="Arial, sans-serif">
        <text x="50%" y="48%" font-size="28" text-anchor="middle">${text}</text>
        <text x="50%" y="58%" font-size="16" text-anchor="middle">Beauty Care</text>
      </g>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${svg.replace(/\s+/g, " ").trim()}`;
}

function rotateImages(images = [], offset = 1) {
  if (!Array.isArray(images) || images.length <= 1) return images || [];
  const normalized = images.filter(Boolean);
  if (normalized.length <= 1) return normalized;
  const shift = ((offset % normalized.length) + normalized.length) % normalized.length;
  return normalized.slice(shift).concat(normalized.slice(0, shift));
}

function getProductCarouselImages(product, fallbackImage) {
  const gallery = Array.isArray(product?.image_gallery)
    ? product.image_gallery.filter(Boolean)
    : [];
  const baseImages = gallery.length
    ? gallery
    : [product?.image_url].filter(Boolean);
  const normalized = baseImages.length ? baseImages : [fallbackImage];
  return rotateImages(normalized, 1);
}

function getPrimaryProductImage(product, fallbackIndex = 0) {
  const fallbackImage = getFallbackImageUrl(product?.name, fallbackIndex);
  const carouselImages = getProductCarouselImages(product, fallbackImage);
  const primaryImage = carouselImages[0] || fallbackImage;
  const isPlaceholder =
    typeof primaryImage === "string" && primaryImage.includes("placehold.co");
  return {
    imageUrl: !isPlaceholder ? primaryImage : fallbackImage,
    isPlaceholder,
  };
}

function formatCurrency(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return safeValue.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function formatCurrencyAmount(value) {
  return roundCurrency(value).toFixed(2);
}

function getMsrpValue(product) {
  if (product.msrp != null) return product.msrp;
  if (product.price != null) return Math.round(product.price * 1.2);
  return null;
}

function formatCartColor(value) {
  if (!value) return "Neutral";
  return normalizeLabel(value);
}

function getPlpPrimaryImage(product, fallbackIndex = 0) {
  const fallbackImage = getFallbackImageUrl(product?.name, fallbackIndex);
  const carouselImages = getProductCarouselImages(product, fallbackImage);
  const primaryImage = carouselImages[0] || fallbackImage;
  const isPlaceholder =
    typeof primaryImage === "string" && primaryImage.includes("placehold.co");
  return !isPlaceholder ? primaryImage : fallbackImage;
}

function buildCartItem(product, options = {}, fallbackIndex = 0) {
  const msrp = getMsrpValue(product) ?? product.price ?? 0;
  const price = product.price ?? msrp ?? 0;
  const resolvedColor =
    options.color === undefined
      ? formatCartColor(product.colors?.[0])
      : options.color
        ? formatCartColor(options.color)
        : null;
  const couponApplicable = (product.coupon_applicable || "").toString().trim();
  const allPromotions = product.promotions && Array.isArray(product.promotions)
    ? product.promotions.filter((p) => p && String(p).trim())
    : [];
  const promotions = allPromotions.slice(0, 1);
  return {
    id: product.id ?? getProductKey(product, fallbackIndex),
    name: product.name || "Item",
    price,
    msrp,
    qty: options.qty ?? 1,
    color: resolvedColor,
    size: options.size || product.sizes?.[0] || "One size",
    fit: options.fit || null,
    imageUrl: getPlpPrimaryImage(product, fallbackIndex),
    couponApplicable: couponApplicable ? normalizeCouponCode(couponApplicable) : "",
    promotions,
  };
}

function seedCartItems(primaryItem, count = 3) {
  const sorted = [...allProducts].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );
  const seeded = [];
  for (const product of sorted) {
    if (seeded.length >= count) break;
    if (product.id === primaryItem.id) continue;
    seeded.push(buildCartItem(product, {}, seeded.length + 1));
  }
  return seeded;
}

function getCouponRatesByScope(couponCodes = []) {
  const codes = Array.isArray(couponCodes) ? couponCodes : [couponCodes];
  const uniqueCodes = [
    ...new Set(codes.map(normalizeCouponCode).filter(Boolean)),
  ];
  const rates = uniqueCodes.reduce(
    (totals, code) => {
      const definition = getCouponDefinition(code);
      if (!definition) return totals;
      const rate = definition.rate ?? 0;
      if (definition.scope === "order") {
        totals.order += rate;
      } else {
        totals.item += rate;
      }
      return totals;
    },
    { item: 0, order: 0 }
  );
  const itemRate = Math.min(1, rates.item);
  const orderRate = Math.min(1, rates.order);
  const combinedRate = Math.min(1, itemRate + orderRate);
  return { itemRate, orderRate, combinedRate };
}

/** Item-level discount rate for one item (sum of applied item-level coupon rates, capped at 1). */
function getItemLevelDiscountRate(itemId, appliedItemCoupons = {}) {
  const codes = appliedItemCoupons[itemId] || [];
  const uniqueCodes = [...new Set(codes.map(normalizeCouponCode).filter(Boolean))];
  let rate = 0;
  for (const code of uniqueCodes) {
    const def = getCouponDefinition(code);
    if (def && def.scope !== "order") rate += def.rate ?? 0;
  }
  return Math.min(1, rate);
}

/** Cart-level discount rate from applied cart coupons only. */
function getCartLevelDiscountRate(appliedCartCoupons = []) {
  const { orderRate } = getCouponRatesByScope(appliedCartCoupons);
  return orderRate;
}

/** Cart-level promotion: 10% off subtotal only (single generic promotion). */
const CART_PROMOTION_LABEL = "10% off with summersale";
const CART_PROMOTION_RATE = 0.1;

/** Promotion label -> discount rate (item-level, auto-applied). */
const PROMOTION_RATES = {
  "10% off on skin essentials": 0.1,
  "15% off on new range": 0.15,
  "5% off on new launches": 0.05,
};

/** Item-level discount rate from auto-applied promotions only. */
function getItemPromotionRate(item) {
  const list = item.promotions && Array.isArray(item.promotions) ? item.promotions : [];
  let rate = 0;
  for (const label of list) {
    const r = PROMOTION_RATES[String(label).trim()];
    if (typeof r === "number") rate += r;
  }
  return Math.min(1, rate);
}

function calculateCartTotals(items, appliedItemCoupons = {}, appliedCartCoupons = []) {
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);
  const subtotalAfterItemDiscount = roundCurrency(
    items.reduce((sum, item) => {
      const lineRaw = item.price * item.qty;
      const couponRate = getItemLevelDiscountRate(item.id, appliedItemCoupons);
      const promotionRate = getItemPromotionRate(item);
      const itemRate = Math.min(1, couponRate + promotionRate);
      return sum + roundCurrency(lineRaw * (1 - itemRate));
    }, 0)
  );
  const orderRate = getCartLevelDiscountRate(appliedCartCoupons);
  const orderDiscount = roundCurrency(subtotalAfterItemDiscount * orderRate);
  const cartPromotion = roundCurrency(subtotalAfterItemDiscount * CART_PROMOTION_RATE);
  const shipping = items.length ? 60 : 0;
  const shippingDiscount = orderRate ? shipping : 0;
  const taxableAmount = Math.max(
    0,
    subtotalAfterItemDiscount - orderDiscount - cartPromotion
  );
  const taxes = roundCurrency(taxableAmount * 0.05);
  const total = roundCurrency(
    subtotalAfterItemDiscount -
      orderDiscount -
      cartPromotion +
      shipping -
      shippingDiscount +
      taxes
  );
  return {
    subtotal: subtotalAfterItemDiscount,
    promotions: cartPromotion,
    orderDiscount,
    shipping,
    shippingDiscount,
    taxes,
    total,
    itemCount,
  };
}

function generateOrderId() {
  const seed = String(Date.now()).slice(-8);
  return seed.padStart(8, "0");
}

function formatDeliveryDate(daysFromNow = 2) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day % 100 !== 11
      ? "st"
      : day % 10 === 2 && day % 100 !== 12
        ? "nd"
        : day % 10 === 3 && day % 100 !== 13
          ? "rd"
          : "th";
  return `${weekday} the ${day}${suffix}`;
}

function createOrderSummaryBubble({
  items = [],
  appliedItemCoupons = {},
  appliedCartCoupons = [],
} = {}) {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant order-summary-bubble";

  const card = document.createElement("div");
  card.className = "card order-summary-card";

  const header = document.createElement("div");
  header.className = "order-summary-header";

  const title = document.createElement("div");
  title.className = "order-summary-title";
  title.textContent = "Congratulations! Your order is confirmed.";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "order-summary-toggle";
  toggleButton.setAttribute("aria-label", "Toggle order summary");
  const toggleIcon = document.createElement("span");
  toggleIcon.className = "order-summary-toggle-icon";
  toggleButton.append(toggleIcon);

  header.append(title, toggleButton);

  const content = document.createElement("div");
  content.className = "order-summary-content";

  const primaryItem = items[0]?.name || "item";
  const delivery = document.createElement("div");
  delivery.className = "order-summary-subtitle";
  delivery.textContent = `Your new ${primaryItem} will arrive in 2 days on ${formatDeliveryDate(
    2
  )}.`;

  const divider = document.createElement("div");
  divider.className = "order-summary-divider";

  const details = document.createElement("div");
  details.className = "order-summary-details";

  const orderId = document.createElement("div");
  orderId.className = "order-summary-meta";
  orderId.innerHTML = `Order ID <span class="order-summary-id">#${generateOrderId()}</span>`;

  const itemsList = document.createElement("div");
  itemsList.className = "order-summary-items";
  const fallbackImages = ["Bag1.png", "Bag2.png", "Bag3.png", "Bag4.png"];

  items.forEach((item, index) => {
    const couponRate = getItemLevelDiscountRate(item.id, appliedItemCoupons);
    const promotionRate = getItemPromotionRate(item);
    const itemRate = Math.min(1, couponRate + promotionRate);
    const shouldShowDiscount = itemRate > 0;

    const itemRow = document.createElement("div");
    itemRow.className = "cart-item order-summary-item";

    const thumb = document.createElement("div");
    thumb.className = "cart-item-thumb order-summary-thumb";
    const imageUrl =
      item.imageUrl &&
      typeof item.imageUrl === "string" &&
      !item.imageUrl.includes("placehold.co")
        ? item.imageUrl
        : fallbackImages[index % fallbackImages.length];
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = item.name;
      img.loading = "lazy";
      thumb.append(img);
    } else {
      thumb.classList.add("cart-item-thumb--placeholder");
      thumb.textContent = item.name.charAt(0).toUpperCase();
    }

    const detailsInner = document.createElement("div");
    detailsInner.className = "cart-item-details order-summary-details";
    const name = document.createElement("div");
    name.className = "cart-item-name";
    name.textContent = item.name;
    const meta = document.createElement("div");
    meta.className = "cart-item-meta";
    meta.innerHTML = `
      <div class="cart-item-meta-group">
        <div class="cart-item-meta-label">Size</div>
        <div class="cart-item-meta-value">${item.size}</div>
      </div>
      <div class="cart-item-meta-qty-group">
        <div class="cart-item-meta-qty-label">Qty</div>
        <div class="cart-item-meta-qty-value">${item.qty}</div>
      </div>
    `;
    detailsInner.append(name, meta);

    const price = document.createElement("div");
    price.className = "cart-item-price";
    const sale = document.createElement("div");
    sale.className = "cart-item-sale";
    const lineTotal = item.price * item.qty;
    const discountedTotal = roundCurrency(lineTotal * (1 - itemRate));
    sale.textContent = formatCurrency(discountedTotal);
    price.append(sale);
    if (shouldShowDiscount) {
      const msrp = document.createElement("div");
      msrp.className = "cart-item-msrp";
      msrp.textContent = formatCurrency(item.price * item.qty);
      price.append(msrp);
    }

    itemRow.append(thumb, detailsInner, price);
    itemsList.append(itemRow);
  });

  const totals = document.createElement("div");
  totals.className = "order-summary-totals";
  const totalsData = calculateCartTotals(items, appliedItemCoupons, appliedCartCoupons);
  const appliedCouponLabels = (appliedCartCoupons || []).map(formatCouponLabel).filter(Boolean);

  const couponAppliedRow = document.createElement("div");
  couponAppliedRow.className = "order-summary-total-row order-summary-coupon-row";
  couponAppliedRow.innerHTML = `<span>Coupon applied</span><span class="order-summary-coupon-code"></span>`;
  couponAppliedRow.style.display = appliedCouponLabels.length ? "flex" : "none";
  couponAppliedRow.querySelector(".order-summary-coupon-code").textContent =
    appliedCouponLabels.join(", ");

  const subtotalRow = document.createElement("div");
  subtotalRow.className = "order-summary-total-row";
  subtotalRow.innerHTML = `<span>Subtotal</span><span>${formatCurrency(
    totalsData.subtotal
  )}</span>`;

  const couponDiscountRow = document.createElement("div");
  couponDiscountRow.className = "order-summary-total-row";
  couponDiscountRow.innerHTML = `<span>Coupon Discount</span><span>${
    totalsData.orderDiscount ? `-${formatCurrency(totalsData.orderDiscount)}` : "-"
  }</span>`;

  const promotionsRow = document.createElement("div");
  promotionsRow.className = "order-summary-total-row";
  promotionsRow.innerHTML = `<span>Promotions</span><span title="${CART_PROMOTION_LABEL}">${
    totalsData.promotions
      ? `-${formatCurrency(totalsData.promotions)}`
      : "-"
  }</span>`;

  const shippingRow = document.createElement("div");
  shippingRow.className = "order-summary-total-row";
  shippingRow.innerHTML = `<span>Shipping</span><span>${
    totalsData.shipping ? formatCurrency(totalsData.shipping) : "-"
  }</span>`;

  const taxesRow = document.createElement("div");
  taxesRow.className = "order-summary-total-row";
  taxesRow.innerHTML = `<span>Taxes</span><span>${
    totalsData.taxes ? formatCurrency(totalsData.taxes) : "-"
  }</span>`;

  const totalRow = document.createElement("div");
  totalRow.className = "order-summary-total-row order-summary-total-strong";
  totalRow.innerHTML = `<span>Total</span><span>${formatCurrency(
    totalsData.total
  )}</span>`;

  totals.append(
    couponAppliedRow,
    subtotalRow,
    couponDiscountRow,
    promotionsRow,
    shippingRow,
    taxesRow,
    totalRow
  );

  const footer = document.createElement("div");
  footer.className = "order-summary-footer";
  footer.textContent =
    "Let me know what you wish to do next or have any questions about this order.";

  details.append(orderId, itemsList, totals);
  content.append(delivery, divider, details, footer);
  card.append(header, content);
  bubble.append(card);

  const setExpanded = (expanded) => {
    card.classList.toggle("order-summary-card--expanded", expanded);
    details.hidden = !expanded;
    divider.hidden = expanded;
    toggleButton.setAttribute("aria-expanded", String(expanded));
  };

  let isExpanded = false;
  setExpanded(isExpanded);

  toggleButton.addEventListener("click", () => {
    isExpanded = !isExpanded;
    setExpanded(isExpanded);
  });

  return bubble;
}

function createOrderNbaChips() {
  const row = document.createElement("div");
  row.className = "chips";
  row.innerHTML = `
    <button class="chip" data-prompt="Buy a gentle cleanser">Buy a gentle cleanser</button>
    <button class="chip" data-prompt="Hydrating serum">Hydrating serum</button>
    <button class="chip" data-prompt="Where is my order?">Where is my order?</button>
    <button class="chip" data-prompt="Return product">Return product</button>
  `;
  hideNbaPillSets(row);
  row.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const prompt = button.dataset.prompt || button.textContent.trim();
    addBubble("user", prompt);
    hideNbaPillSet(row);
    searchInput.value = prompt;
    handleSearch();
  });
  return row;
}

function completeApplePayDemo({
  items = [],
  appliedItemCoupons = {},
  appliedCartCoupons = [],
} = {}) {
  addBubble("user", "Pay with Apple Pay");
  runWithLatency(() => {
    const summaryBubble = createOrderSummaryBubble({
      items,
      appliedItemCoupons,
      appliedCartCoupons,
    });
    const orderChips = createOrderNbaChips();
    chatEl.append(summaryBubble, orderChips);
    scrollChatElementIntoView(orderChips);
    updateScrollButton();
  }, LATENCY_MS, "Finalizing payment...");
}

function buildApplePayDisplayItems(items, totals) {
  const displayItems = items.map((item) => ({
    label: `${item.qty} × ${item.name}`,
    amount: {
      currency: APPLE_PAY_CURRENCY,
      value: formatCurrencyAmount(item.price * item.qty),
    },
  }));

  if (totals.promotions) {
    displayItems.push({
      label: "Promotions",
      amount: {
        currency: APPLE_PAY_CURRENCY,
        value: formatCurrencyAmount(-totals.promotions),
      },
    });
  }

  if (totals.orderDiscount) {
    displayItems.push({
      label: "Coupon discount",
      amount: {
        currency: APPLE_PAY_CURRENCY,
        value: formatCurrencyAmount(-totals.orderDiscount),
      },
    });
  }

  if (totals.shipping) {
    displayItems.push({
      label: "Shipping",
      amount: {
        currency: APPLE_PAY_CURRENCY,
        value: formatCurrencyAmount(totals.shipping),
      },
    });
  }

  if (totals.shippingDiscount) {
    displayItems.push({
      label: "Shipping discount",
      amount: {
        currency: APPLE_PAY_CURRENCY,
        value: formatCurrencyAmount(-totals.shippingDiscount),
      },
    });
  }

  if (totals.taxes) {
    displayItems.push({
      label: "Taxes",
      amount: {
        currency: APPLE_PAY_CURRENCY,
        value: formatCurrencyAmount(totals.taxes),
      },
    });
  }

  return displayItems;
}

async function tryApplePayPayment({
  items = [],
  appliedItemCoupons = {},
  appliedCartCoupons = [],
} = {}) {
  if (!window.PaymentRequest || !window.isSecureContext) {
    return "unavailable";
  }

  const totals = calculateCartTotals(items, appliedItemCoupons, appliedCartCoupons);
  const details = {
    total: {
      label: APPLE_PAY_MERCHANT_NAME,
      amount: {
        currency: APPLE_PAY_CURRENCY,
        value: formatCurrencyAmount(totals.total),
      },
    },
    displayItems: buildApplePayDisplayItems(items, totals),
  };

  const methodData = [
    {
      supportedMethods: "https://apple.com/apple-pay",
      data: {
        version: 3,
        merchantIdentifier: APPLE_PAY_MERCHANT_ID,
        merchantCapabilities: ["supports3DS"],
        supportedNetworks: ["visa", "masterCard", "amex", "discover"],
        countryCode: APPLE_PAY_COUNTRY,
      },
    },
  ];

  let request;
  try {
    request = new PaymentRequest(methodData, details, {
      requestPayerName: true,
      requestPayerEmail: true,
      requestPayerPhone: true,
    });
  } catch (error) {
    return "unavailable";
  }

  if (typeof request.canMakePayment === "function") {
    try {
      const canMakePayment = await request.canMakePayment();
      if (!canMakePayment) return "unavailable";
    } catch (error) {
      return "unavailable";
    }
  }

  try {
    const response = await request.show();
    await response.complete("success");
    return "success";
  } catch (error) {
    if (error?.name === "AbortError") return "aborted";
    if (error?.name === "NotSupportedError") return "unavailable";
    return "failed";
  }
}

async function startApplePayFlow({
  items = [],
  appliedItemCoupons = {},
  appliedCartCoupons = [],
} = {}) {
  const result = await tryApplePayPayment({
    items,
    appliedItemCoupons,
    appliedCartCoupons,
  });
  if (result === "success") {
    completeApplePayDemo({ items, appliedItemCoupons, appliedCartCoupons });
    return;
  }
  if (result === "aborted") {
    return;
  }
  openApplePayModal({ items, appliedItemCoupons, appliedCartCoupons });
}

function createApplePayBreakdownModal() {
  const modal = document.createElement("div");
  modal.className = "apple-pay-modal apple-pay-breakdown-modal";
  modal.setAttribute("aria-hidden", "true");

  const backdrop = document.createElement("div");
  backdrop.className = "apple-pay-backdrop";

  const sheet = document.createElement("div");
  sheet.className = "apple-pay-sheet apple-pay-breakdown-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Payment summary");
  sheet.innerHTML = `
    <div class="apple-pay-breakdown-header">
      <button class="apple-pay-close apple-pay-breakdown-close" type="button" aria-label="Close payment summary">✕</button>
      <div class="apple-pay-breakdown-title">Payment Summary</div>
      <span class="apple-pay-breakdown-spacer" aria-hidden="true"></span>
    </div>
    <div class="apple-pay-breakdown-merchant">
      <div class="apple-pay-breakdown-merchant-icon" aria-hidden="true">S</div>
      <div class="apple-pay-breakdown-merchant-text">
        <div class="apple-pay-breakdown-merchant-name">${APPLE_PAY_MERCHANT_NAME}</div>
        <div class="apple-pay-breakdown-merchant-site">${APPLE_PAY_MERCHANT_SITE}</div>
      </div>
    </div>
    <div class="apple-pay-breakdown-section-title">Summary</div>
    <div class="apple-pay-breakdown-card">
      <div class="apple-pay-breakdown-row">
        <span>Subtotal</span>
        <span class="apple-pay-breakdown-subtotal"></span>
      </div>
      <div class="apple-pay-breakdown-row">
        <span>Shipping</span>
        <span class="apple-pay-breakdown-shipping"></span>
      </div>
      <div class="apple-pay-breakdown-row">
        <span>Shipping Discount</span>
        <span class="apple-pay-breakdown-shipping-discount"></span>
      </div>
      <div class="apple-pay-breakdown-row">
        <span>Taxes</span>
        <span class="apple-pay-breakdown-taxes"></span>
      </div>
    </div>
    <div class="apple-pay-breakdown-total">
      <span>Total</span>
      <strong class="apple-pay-breakdown-total-value"></strong>
    </div>
  `;

  modal.append(backdrop, sheet);
  document.body.append(modal);

  const closeButton = sheet.querySelector(".apple-pay-breakdown-close");
  const merchantIcon = sheet.querySelector(".apple-pay-breakdown-merchant-icon");
  const merchantName = sheet.querySelector(".apple-pay-breakdown-merchant-name");
  const merchantSite = sheet.querySelector(".apple-pay-breakdown-merchant-site");
  const subtotalValue = sheet.querySelector(".apple-pay-breakdown-subtotal");
  const shippingValue = sheet.querySelector(".apple-pay-breakdown-shipping");
  const shippingDiscountValue = sheet.querySelector(
    ".apple-pay-breakdown-shipping-discount"
  );
  const taxesValue = sheet.querySelector(".apple-pay-breakdown-taxes");
  const totalValue = sheet.querySelector(".apple-pay-breakdown-total-value");

  const closeModal = () => {
    modal.classList.remove("is-visible");
    modal.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".apple-pay-modal.is-visible")) {
      document.body.classList.remove("modal-open");
    }
  };

  const openModal = ({ totals, merchantLabel, merchantSiteLabel } = {}) => {
    const name = merchantLabel || APPLE_PAY_MERCHANT_NAME;
    const site = merchantSiteLabel || APPLE_PAY_MERCHANT_SITE;
    merchantName.textContent = name;
    merchantSite.textContent = site;
    merchantIcon.textContent = name?.trim()?.charAt(0)?.toUpperCase() || "M";

    subtotalValue.textContent = formatCurrency(totals?.subtotal ?? 0);
    shippingValue.textContent = totals?.shipping
      ? formatCurrency(totals.shipping)
      : "-";
    shippingDiscountValue.textContent = totals?.shippingDiscount
      ? `-${formatCurrency(totals.shippingDiscount)}`
      : "-";
    taxesValue.textContent = totals?.taxes ? formatCurrency(totals.taxes) : "-";
    totalValue.textContent = formatCurrency(totals?.total ?? 0);

    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  };

  backdrop.addEventListener("click", closeModal);
  closeButton.addEventListener("click", closeModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-visible")) {
      closeModal();
    }
  });

  return { openModal };
}

function createApplePayModal() {
  const modal = document.createElement("div");
  modal.className = "apple-pay-modal";
  modal.setAttribute("aria-hidden", "true");

  const backdrop = document.createElement("div");
  backdrop.className = "apple-pay-backdrop";

  const hint = document.createElement("div");
  hint.className = "apple-pay-hint";
  hint.innerHTML = `
    <span>Double Click</span>
    <span>to Pay</span>
  `;

  const sheet = document.createElement("div");
  sheet.className = "apple-pay-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Apple Pay");
  sheet.innerHTML = `
    <div class="apple-pay-header">
      <div class="apple-pay-header-title">
        <span class="apple-pay-logo"></span>
        <span>Pay</span>
      </div>
      <button class="apple-pay-close" type="button" aria-label="Close Apple Pay">✕</button>
    </div>
    <div class="apple-pay-section">
      <div class="apple-pay-card">
        <div class="apple-pay-address-card">
          <div class="apple-pay-address-icon" aria-hidden="true" data-cursor-element-id="cursor-el-1"></div>
          <div class="apple-pay-address-body">
            <div class="apple-pay-address-label">Ship to</div>
            <div class="apple-pay-address-line">Jason Winters</div>
            <div class="apple-pay-address-line">205 Market Street</div>
            <div class="apple-pay-address-line">San Francisco, CA 94111</div>
            <div class="apple-pay-address-line">United States</div>
            <div class="apple-pay-address-line">+1 (415) 555-0132</div>
          </div>
          <span class="apple-pay-address-chevron">›</span>
        </div>
      </div>
    </div>
    <div class="apple-pay-section">
      <div class="apple-pay-card apple-pay-card--row">
        <div class="apple-pay-card-left">
          <div class="apple-pay-card-thumb" aria-hidden="true"></div>
          <div class="apple-pay-card-text">
            <div class="apple-pay-card-title">Apple Card</div>
          </div>
        </div>
        <div class="apple-pay-card-right">
          <span class="apple-pay-card-meta">•••• 2037</span>
          <span class="apple-pay-card-chevron">›</span>
        </div>
      </div>
    </div>
    <div class="apple-pay-section">
      <div class="apple-pay-card">
        <div class="apple-pay-contact-card">
          <div class="apple-pay-contact-icon" aria-hidden="true"></div>
          <div class="apple-pay-contact-body">
            <div class="apple-pay-contact-label">Contact</div>
            <div class="apple-pay-contact-line">jwinters@salesforce.com</div>
            <div class="apple-pay-contact-line">+1 (415) 555-0132</div>
          </div>
        </div>
      </div>
    </div>
    <div class="apple-pay-summary">
      <div class="apple-pay-row">
        <div class="apple-pay-total-row">
          <span class="apple-pay-merchant">Pay to Shiseido A/S</span>
          <button class="apple-pay-info" type="button" aria-label="Payment total details">i</button>
        </div>
        <strong class="apple-pay-total-value"></strong>
      </div>
    </div>
    <button class="apple-pay-cta" type="button" data-cursor-element-id="cursor-el-271">Pay with Apple Pay</button>
    <div class="apple-pay-footnote">
      By confirming, you agree to the order total and the selected shipping method.
    </div>
  `;

  modal.append(backdrop, hint, sheet);
  document.body.append(modal);

  const totalValue = sheet.querySelector(".apple-pay-total-value");
  const itemCount = sheet.querySelector(".apple-pay-item-count");
  const closeButton = sheet.querySelector(".apple-pay-close");
  const ctaButton = sheet.querySelector(".apple-pay-cta");
  const infoButton = sheet.querySelector(".apple-pay-info");
  const merchantLabel = sheet.querySelector(".apple-pay-merchant");

  if (!applePayBreakdownModal) {
    applePayBreakdownModal = createApplePayBreakdownModal();
  }

  let latestItems = [];
  let latestItemCoupons = {};
  let latestCartCoupons = [];

  const closeModal = () => {
    modal.classList.remove("is-visible");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  const openModal = ({
    total,
    itemsLabel,
    items = [],
    appliedItemCoupons = {},
    appliedCartCoupons = [],
  }) => {
    totalValue.textContent = formatCurrency(total);
    if (itemCount) {
      itemCount.textContent = itemsLabel;
    }
    latestItems = items;
    latestItemCoupons = appliedItemCoupons;
    latestCartCoupons = appliedCartCoupons;
    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  };

  backdrop.addEventListener("click", closeModal);
  closeButton.addEventListener("click", closeModal);
  ctaButton.addEventListener("click", async () => {
    closeModal();
    const result = await tryApplePayPayment({
      items: latestItems,
      appliedItemCoupons: latestItemCoupons,
      appliedCartCoupons: latestCartCoupons,
    });
    if (result === "aborted") {
      return;
    }
    completeApplePayDemo({
      items: latestItems,
      appliedItemCoupons: latestItemCoupons,
      appliedCartCoupons: latestCartCoupons,
    });
  });

  if (infoButton) {
    infoButton.addEventListener("click", () => {
      const totals = calculateCartTotals(
        latestItems,
        latestItemCoupons,
        latestCartCoupons
      );
      const merchantName =
        (merchantLabel?.textContent || "")
          .replace(/^Pay to\s+/i, "")
          .trim() || APPLE_PAY_MERCHANT_NAME;
      applePayBreakdownModal.openModal({
        totals,
        merchantLabel: merchantName,
        merchantSiteLabel: APPLE_PAY_MERCHANT_SITE,
      });
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-visible")) {
      closeModal();
    }
  });

  return { openModal };
}

function openApplePayModal({
  items = [],
  appliedItemCoupons = {},
  appliedCartCoupons = [],
} = {}) {
  if (!applePayModal) {
    applePayModal = createApplePayModal();
  }
  const totals = calculateCartTotals(items, appliedItemCoupons, appliedCartCoupons);
  const itemsLabel =
    totals.itemCount === 1 ? "1 item" : `${totals.itemCount} items`;
  applePayModal.openModal({
    total: totals.total,
    itemsLabel,
    items,
    appliedItemCoupons,
    appliedCartCoupons,
  });
}

function normalizeCouponCode(code) {
  if (!code) return "";
  return String(code).replace(/\s+/g, "").toLowerCase();
}

const COUPON_DEFINITIONS = {
  save10: { rate: 0.1, label: "Save 10" },
  save15: { rate: 0.15, label: "Save 15" },
  save20: { rate: 0.2, label: "Save 20" },
  sitewide10: { rate: 0.1, label: "Sitewide 10", scope: "order" },
  cartlevel15: { rate: 0.15, label: "Cart Level 15", scope: "order" },
  anniversary15: { rate: 0.15, label: "Anniversary 15" },
  orderlevel15: { rate: 0.15, label: "Order Level 15", scope: "order" },
  order10: { rate: 0.1, label: "10% off", scope: "order" },
  order15: { rate: 0.15, label: "15% off", scope: "order" },
  order20: { rate: 0.2, label: "20% off", scope: "order" },
  order1500: { rate: 0.15, label: "Order $1500", scope: "order", minOrder: 1500 },
  christmas20: { rate: 0.2, label: "Christmas 20" },
  newyear15: { rate: 0.15, label: "New Year 15" },
  first25: { rate: 0.25, label: "First 25" },
};

function getCouponDefinition(code) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return null;
  return COUPON_DEFINITIONS[normalized] ?? null;
}

/** Returns whether an order-level coupon currently qualifies (e.g. meets minOrder). */
function orderCouponQualifies(normalized, items, appliedItemCoupons = {}) {
  const def = getCouponDefinition(normalized);
  if (!def || def.scope !== "order") return false;
  const minOrder = def.minOrder;
  if (minOrder == null) return true;
  const { subtotal } = calculateCartTotals(items, appliedItemCoupons, []);
  return subtotal >= minOrder;
}

/** Returns whether an item-level coupon has any qualifying items in the cart. */
function itemCouponQualifies(normalized, items) {
  return items.some((item) => item.couponApplicable === normalized);
}

/** Move inactive coupons to applied when they become eligible; mutates state. */
function reconcileInactiveCoupons(state) {
  const inactive = state.inactiveCoupons || [];
  if (inactive.length === 0) return;
  const items = state.items || [];
  let appliedItemCoupons = { ...(state.appliedItemCoupons || {}) };
  let appliedCartCoupons = [...(state.appliedCartCoupons || [])];
  const stillInactive = [];
  for (const code of inactive) {
    const def = getCouponDefinition(code);
    if (!def) continue;
    if (def.scope === "order") {
      if (orderCouponQualifies(code, items, appliedItemCoupons)) {
        if (!appliedCartCoupons.includes(code)) appliedCartCoupons.unshift(code);
      } else {
        stillInactive.push(code);
      }
    } else {
      const eligibleIds = items.filter((item) => item.couponApplicable === code).map((item) => item.id);
      if (eligibleIds.length > 0) {
        eligibleIds.forEach((id) => {
          const list = appliedItemCoupons[id] || [];
          if (!list.includes(code)) appliedItemCoupons[id] = [...list, code];
        });
      } else {
        stillInactive.push(code);
      }
    }
  }
  state.appliedItemCoupons = appliedItemCoupons;
  state.appliedCartCoupons = appliedCartCoupons;
  state.inactiveCoupons = stillInactive;
}

function getCouponDiscountRate(code) {
  return getCouponDefinition(code)?.rate ?? 0;
}

function formatCouponLabel(code) {
  const definition = getCouponDefinition(code);
  if (definition?.label) return definition.label;
  if (!code) return "";
  return normalizeLabel(String(code).trim());
}

function formatCouponPillLabel(code) {
  if (!code) return "";
  return normalizeCouponCode(code).toUpperCase();
}

function buildAddToCartMessage(item) {
  if (!item) return "Done! The item was added to the cart.";
  const qtyLabel = `${item.qty} ${item.name}`;
  const sizeText = item.size || "one size";
  const sizeLabel = /size/i.test(sizeText) ? sizeText : `${sizeText} size`;
  return `Done! ${qtyLabel} in ${sizeLabel} was added to the cart.`;
}

function createCartBubble(state, addedItem, options = {}) {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant cart-bubble";

  const card = document.createElement("div");
  card.className = "card cart-card";

  const header = document.createElement("div");
  header.className = "cart-header";
  header.textContent = options.headerText || buildAddToCartMessage(addedItem);

  const divider = document.createElement("div");
  divider.className = "cart-divider";

  reconcileInactiveCoupons(state);
  const inactiveCoupons = state.inactiveCoupons || [];
  const inactiveAlert = document.createElement("div");
  inactiveAlert.className = "cart-inactive-coupon-alert";
  const firstInactive = inactiveCoupons.length > 0 ? inactiveCoupons[0] : null;
  inactiveAlert.textContent =
    firstInactive != null
      ? `Oh Snap!. Coupon '${formatCouponPillLabel(firstInactive)}' has been added but does not apply to any items in your cart. It will auto apply when eligible.`
      : "";
  inactiveAlert.hidden = inactiveCoupons.length === 0;

  const summaryRow = document.createElement("div");
  summaryRow.className = "cart-summary-row";

  const summaryText = document.createElement("div");
  summaryText.className = "cart-summary-text";
  const summaryCount = document.createElement("span");
  summaryCount.className = "cart-summary-count";
  const summaryTotal = document.createElement("span");
  summaryTotal.className = "cart-summary-total";
  summaryText.append(
    "Your cart has ",
    summaryCount,
    " with a total of ",
    summaryTotal,
    ". Use options below for checkout."
  );

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "cart-toggle";
  toggleButton.setAttribute("aria-label", "Toggle cart details");
  const toggleIcon = document.createElement("span");
  toggleIcon.className = "cart-toggle-icon";
  toggleButton.append(toggleIcon);

  summaryRow.append(summaryText, toggleButton);

  const couponRow = document.createElement("div");
  couponRow.className = "cart-coupon-row";
  const couponInput = document.createElement("input");
  couponInput.type = "text";
  couponInput.placeholder = "Enter coupon code...";
  couponInput.value = "";
  couponInput.className = "cart-coupon-input";
  couponInput.setAttribute("aria-label", "Enter coupon code");
  const couponButton = document.createElement("button");
  couponButton.type = "button";
  couponButton.className = "cart-coupon-apply";
  const couponButtonLabel = document.createElement("span");
  couponButtonLabel.className = "cart-coupon-apply-label";
  couponButtonLabel.textContent = "Apply";
  const couponLoader = document.createElement("img");
  couponLoader.className = "cart-coupon-loader";
  couponLoader.src = "Latency_loader.png";
  couponLoader.alt = "";
  couponLoader.setAttribute("aria-hidden", "true");
  couponButton.append(couponButtonLabel, couponLoader);
  couponRow.append(couponInput, couponButton);

  const expandedSection = document.createElement("div");
  expandedSection.className = "cart-expanded";

  const itemsList = document.createElement("div");
  itemsList.className = "cart-items";

  const fallbackImages = ["Bag1.png", "Bag2.png", "Bag3.png", "Bag4.png"];
  const appliedItemCoupons = state.appliedItemCoupons || {};
  const appliedCartCoupons = state.appliedCartCoupons || [];

  state.items.forEach((item, index) => {
    const couponRate = getItemLevelDiscountRate(item.id, appliedItemCoupons);
    const promotionRate = getItemPromotionRate(item);
    const totalItemRate = Math.min(1, couponRate + promotionRate);
    const shouldShowItemDiscount = totalItemRate > 0;
    const itemCodes = appliedItemCoupons[item.id] || [];
    const itemPromotions = (item.promotions && Array.isArray(item.promotions) ? item.promotions : []).slice(0, 2);

    const itemRow = document.createElement("div");
    itemRow.className = "cart-item";

    const thumb = document.createElement("div");
    thumb.className = "cart-item-thumb";
    const imageUrl =
      item.imageUrl &&
      typeof item.imageUrl === "string" &&
      !item.imageUrl.includes("placehold.co")
        ? item.imageUrl
        : fallbackImages[index % fallbackImages.length];
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = item.name;
      img.loading = "lazy";
      thumb.append(img);
    } else {
      thumb.classList.add("cart-item-thumb--placeholder");
      thumb.textContent = item.name.charAt(0).toUpperCase();
    }

    const details = document.createElement("div");
    details.className = "cart-item-details";
    const name = document.createElement("div");
    name.className = "cart-item-name";
    name.textContent = item.name;
    const metaTop = document.createElement("div");
    metaTop.className = "cart-item-meta";
    const metaParts = [];
    if (item.color) metaParts.push(`<div class="cart-item-meta-group"><div class="cart-item-meta-label">Color</div><div class="cart-item-meta-value">${item.color}</div></div>`);
    metaParts.push(`<div class="cart-item-meta-group"><div class="cart-item-meta-label">Size</div><div class="cart-item-meta-value">${item.size}</div></div>`);
    metaTop.innerHTML = metaParts.join("");
    details.append(name, metaTop);

    if (itemPromotions.length > 0) {
      const promotionsRow = document.createElement("div");
      promotionsRow.className = "cart-item-promotions";
      const promotionsLabel = document.createElement("span");
      promotionsLabel.className = "cart-item-promotions-label";
      promotionsLabel.textContent = "Promotions";
      const pillsWrap = document.createElement("span");
      pillsWrap.className = "cart-item-promotion-pills";
      itemPromotions.forEach((label) => {
        const pill = document.createElement("span");
        pill.className = "cart-item-promotion-pill";
        pill.textContent = String(label).trim();
        pillsWrap.append(pill);
      });
      promotionsRow.append(promotionsLabel, pillsWrap);
      details.append(promotionsRow);
    }

    const metaQty = document.createElement("div");
    metaQty.className = "cart-item-meta cart-item-meta--qty";
    metaQty.innerHTML = `
      <div class="cart-item-meta-qty-group">
        <div class="cart-item-meta-qty-label">Qty</div>
        <div class="cart-item-meta-qty-value">${item.qty}</div>
      </div>
    `;
    details.append(metaQty);

    if (itemCodes.length > 0) {
      const itemPills = document.createElement("div");
      itemPills.className = "cart-item-coupon-pills";
      itemCodes.forEach((code) => {
        const normalized = normalizeCouponCode(code);
        if (!normalized) return;
        const pill = document.createElement("span");
        pill.className = "cart-coupon-pill cart-item-coupon-pill";
        const label = document.createElement("span");
        label.className = "cart-coupon-pill-label";
        label.textContent = formatCouponPillLabel(normalized);
        const closeIcon = document.createElement("span");
        closeIcon.className = "cart-coupon-pill-close";
        closeIcon.setAttribute("aria-hidden", "true");
        closeIcon.textContent = "×";
        closeIcon.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!state.appliedItemCoupons[item.id]) return;
          const pillLabel = formatCouponPillLabel(normalized);
          addBubble("user", `remove coupon ${pillLabel}`);
          state.appliedItemCoupons[item.id] = state.appliedItemCoupons[item.id].filter(
            (c) => normalizeCouponCode(c) !== normalized
          );
          if (state.appliedItemCoupons[item.id].length === 0) {
            delete state.appliedItemCoupons[item.id];
          }
          applyTotals();
          runWithLatency(() => {
            const cartBubble = createCartBubble(state, null, {
              headerText: `Sure, coupon ${pillLabel} was removed from your cart.`,
            });
            chatEl.append(cartBubble);
            scrollChatElementIntoView(cartBubble);
            updateScrollButton();
          }, LATENCY_MS, "Updating cart...");
        });
        pill.append(label, closeIcon);
        itemPills.append(pill);
      });
      details.append(itemPills);
    }

    const price = document.createElement("div");
    price.className = "cart-item-price";
    const sale = document.createElement("div");
    sale.className = "cart-item-sale";
    const lineTotal = item.price * item.qty;
    const discountedTotal = roundCurrency(lineTotal * (1 - totalItemRate));
    sale.textContent = formatCurrency(discountedTotal);
    price.append(sale);
    if (shouldShowItemDiscount) {
      const msrp = document.createElement("div");
      msrp.className = "cart-item-msrp";
      msrp.textContent = formatCurrency(item.price * item.qty);
      price.append(msrp);
    }

    itemRow.append(thumb, details, price);
    itemsList.append(itemRow);
  });

  const totals = document.createElement("div");
  totals.className = "cart-totals";

  const subtotalRow = document.createElement("div");
  subtotalRow.className = "cart-total-row";
  subtotalRow.innerHTML = `<span>Subtotal</span><span class="cart-total-value"></span>`;

  const promotionsRow = document.createElement("div");
  promotionsRow.className = "cart-total-row";
  promotionsRow.innerHTML = `<span><span class="cart-total-label">Promotions</span><span class="cart-promotion-name"></span></span><span class="cart-total-value cart-total-promotions"></span>`;

  const couponDiscountRow = document.createElement("div");
  couponDiscountRow.className = "cart-total-row";
  couponDiscountRow.innerHTML = `<span>Coupon Discount</span><span class="cart-total-value"></span>`;

  const shippingRow = document.createElement("div");
  shippingRow.className = "cart-total-row";
  shippingRow.innerHTML = `<span>Shipping</span><span class="cart-total-value"></span>`;

  const shippingDiscountRow = document.createElement("div");
  shippingDiscountRow.className = "cart-total-row";
  shippingDiscountRow.innerHTML = `<span>Shipping Discount</span><span class="cart-total-value"></span>`;

  const taxesRow = document.createElement("div");
  taxesRow.className = "cart-total-row";
  taxesRow.innerHTML = `<span>Taxes</span><span class="cart-total-value"></span>`;

  const totalRow = document.createElement("div");
  totalRow.className = "cart-total-row cart-total-row--strong";
  totalRow.innerHTML = `<span>Total</span><span class="cart-total-value"></span>`;

  totals.append(
    subtotalRow,
    promotionsRow,
    couponDiscountRow,
    shippingRow,
    shippingDiscountRow,
    taxesRow,
    totalRow
  );

  expandedSection.append(itemsList, totals);

  const actions = document.createElement("div");
  actions.className = "cart-actions";
  const actionsButtons = document.createElement("div");
  actionsButtons.className = "cart-actions-buttons";
  const applePay = document.createElement("button");
  applePay.type = "button";
  applePay.className = "cart-apple-pay";
  applePay.innerHTML = `<span class="apple-logo"></span> Pay`;
  const checkout = document.createElement("button");
  checkout.type = "button";
  checkout.className = "cart-checkout";
  checkout.innerHTML = `Checkout <span class="cart-checkout-icon">↗</span>`;
  const note = document.createElement("div");
  note.className = "cart-note";
  note.textContent = "Shipping and taxes will be calculated at time of payment.";
  actionsButtons.append(applePay, checkout);
  actions.append(actionsButtons, note);

  const couponPills = document.createElement("div");
  couponPills.className = "cart-coupon-pills";

  const couponSection = document.createElement("div");
  couponSection.className = "cart-coupon-section";
  couponSection.append(couponPills, couponRow);

  card.append(
    header,
    divider,
    inactiveAlert,
    summaryRow,
    expandedSection,
    couponSection,
    actions
  );
  bubble.append(card);

  const applyTotals = () => {
    const totalsData = calculateCartTotals(
      state.items,
      state.appliedItemCoupons || {},
      state.appliedCartCoupons || []
    );
    const appliedCart = (state.appliedCartCoupons || []).filter(Boolean);
    const inactive = (state.inactiveCoupons || []).filter(Boolean);
    const hasAnyPills = appliedCart.length > 0 || inactive.length > 0;
    couponPills.textContent = "";
    couponPills.hidden = !hasAnyPills;
    appliedCart.forEach((coupon) => {
      const normalized = normalizeCouponCode(coupon);
      if (!normalized) return;
      const pill = document.createElement("span");
      pill.className = "cart-coupon-pill";
      const label = document.createElement("span");
      label.className = "cart-coupon-pill-label";
      label.textContent = formatCouponPillLabel(normalized);
      const closeIcon = document.createElement("span");
      closeIcon.className = "cart-coupon-pill-close";
      closeIcon.setAttribute("aria-hidden", "true");
      closeIcon.textContent = "×";
      closeIcon.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const pillLabel = formatCouponPillLabel(normalized);
        addBubble("user", `remove coupon ${pillLabel}`);
        state.appliedCartCoupons = (state.appliedCartCoupons || []).filter(
          (code) => normalizeCouponCode(code) !== normalized
        );
        applyTotals();
        runWithLatency(() => {
          const cartBubble = createCartBubble(state, null, {
            headerText: `Sure, coupon ${pillLabel} was removed from the cart.`,
          });
          chatEl.append(cartBubble);
          scrollChatElementIntoView(cartBubble);
          updateScrollButton();
        }, LATENCY_MS, "Updating cart...");
      });
      pill.append(label, closeIcon);
      couponPills.append(pill);
    });
    inactive.forEach((coupon) => {
      const normalized = normalizeCouponCode(coupon);
      if (!normalized) return;
      const pill = document.createElement("span");
      pill.className = "cart-coupon-pill cart-coupon-pill--disabled";
      const label = document.createElement("span");
      label.className = "cart-coupon-pill-label";
      label.textContent = formatCouponPillLabel(normalized);
      const closeIcon = document.createElement("span");
      closeIcon.className = "cart-coupon-pill-close";
      closeIcon.setAttribute("aria-hidden", "true");
      closeIcon.textContent = "×";
      closeIcon.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const pillLabel = formatCouponPillLabel(normalized);
        addBubble("user", `remove coupon ${pillLabel}`);
        state.inactiveCoupons = (state.inactiveCoupons || []).filter(
          (code) => normalizeCouponCode(code) !== normalized
        );
        applyTotals();
        runWithLatency(() => {
          const cartBubble = createCartBubble(state, null, {
            headerText: `Sure, coupon ${pillLabel} was removed from the cart.`,
          });
          chatEl.append(cartBubble);
          scrollChatElementIntoView(cartBubble);
          updateScrollButton();
        }, LATENCY_MS, "Updating cart...");
      });
      pill.append(label, closeIcon);
      couponPills.append(pill);
    });
    summaryCount.textContent = `${totalsData.itemCount} items`;
    summaryTotal.textContent = formatCurrency(totalsData.total);
    subtotalRow.querySelector(".cart-total-value").textContent = formatCurrency(
      totalsData.subtotal
    );
    const promoSpan = promotionsRow.querySelector(".cart-total-promotions");
    const promoNameEl = promotionsRow.querySelector(".cart-promotion-name");
    if (totalsData.promotions > 0) {
      promoSpan.textContent = `-${formatCurrency(totalsData.promotions)}`;
      promoSpan.title = CART_PROMOTION_LABEL;
      if (promoNameEl) {
        promoNameEl.textContent = CART_PROMOTION_LABEL;
        promoNameEl.className = "cart-promotion-name cart-promotion-name--visible";
      }
    } else {
      promoSpan.textContent = "-";
      promoSpan.title = "";
      if (promoNameEl) {
        promoNameEl.textContent = "";
        promoNameEl.className = "cart-promotion-name";
      }
    }
    couponDiscountRow.querySelector(".cart-total-value").textContent =
      totalsData.orderDiscount
        ? `-${formatCurrency(totalsData.orderDiscount)}`
        : "-";
    shippingRow.querySelector(".cart-total-value").textContent = "-";
    shippingDiscountRow.querySelector(".cart-total-value").textContent = "-";
    taxesRow.querySelector(".cart-total-value").textContent = formatCurrency(
      totalsData.taxes
    );
    totalRow.querySelector(".cart-total-value").textContent = formatCurrency(
      totalsData.total
    );
  };

  const updateCouponRowState = () => {
    const value = couponInput.value.trim();
    couponRow.classList.toggle("cart-coupon-row--filled", value.length > 0);
  };

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const setExpanded = (expanded) => {
    card.classList.toggle("cart-card--expanded", expanded);
    expandedSection.hidden = !expanded;
    toggleButton.setAttribute("aria-expanded", String(expanded));
  };

  let isExpanded = false;
  setExpanded(isExpanded);
  applyTotals();
  updateCouponRowState();

  toggleButton.addEventListener("click", () => {
    isExpanded = !isExpanded;
    setExpanded(isExpanded);
  });

  applePay.addEventListener("click", () => {
    startApplePayFlow({
      items: state.items,
      appliedItemCoupons: state.appliedItemCoupons || {},
      appliedCartCoupons: state.appliedCartCoupons || [],
    });
  });

  couponButton.addEventListener("click", async () => {
    const value = couponInput.value.trim();
    if (!value) return;
    const normalized = normalizeCouponCode(value);
    const couponDefinition = getCouponDefinition(normalized);
    addBubble("user", `Apply coupon code ${value}`);
    couponButton.disabled = true;
    couponInput.disabled = true;
    couponButton.classList.add("is-loading");
    couponButton.setAttribute("aria-busy", "true");
    try {
      await delay(2000);
      if (!couponDefinition) {
        addBubble("assistant", `Sorry, ${value} isn't a valid coupon code.`);
        couponInput.value = "";
        updateCouponRowState();
        return;
      }
      const isCartLevel = couponDefinition.scope === "order";
      const pillLabel = formatCouponPillLabel(normalized);
      const inactiveMessage = `Oh Snap!. Coupon '${pillLabel}' has been added but does not apply to any items in your cart. It will auto apply when eligible.`;

      if (isCartLevel) {
        if (!orderCouponQualifies(normalized, state.items || [], state.appliedItemCoupons || {})) {
          state.inactiveCoupons = state.inactiveCoupons || [];
          if (!state.inactiveCoupons.includes(normalized)) state.inactiveCoupons.push(normalized);
          addBubble("assistant", inactiveMessage);
          couponInput.value = "";
          updateCouponRowState();
          const cartBubble = createCartBubble(state, null, { headerText: inactiveMessage });
          chatEl.append(cartBubble);
          scrollChatElementIntoView(cartBubble);
          updateScrollButton();
          return;
        }
        state.appliedCartCoupons = state.appliedCartCoupons || [];
        const existingIndex = state.appliedCartCoupons.indexOf(normalized);
        if (existingIndex === -1) {
          state.appliedCartCoupons.unshift(normalized);
        } else if (existingIndex > 0) {
          state.appliedCartCoupons.splice(existingIndex, 1);
          state.appliedCartCoupons.unshift(normalized);
        }
      } else {
        const eligibleItemIds = state.items.filter(
          (item) => item.couponApplicable === normalized
        ).map((item) => item.id);
        if (eligibleItemIds.length === 0) {
          state.inactiveCoupons = state.inactiveCoupons || [];
          if (!state.inactiveCoupons.includes(normalized)) state.inactiveCoupons.push(normalized);
          addBubble("assistant", inactiveMessage);
          couponInput.value = "";
          updateCouponRowState();
          const cartBubble = createCartBubble(state, null, { headerText: inactiveMessage });
          chatEl.append(cartBubble);
          scrollChatElementIntoView(cartBubble);
          updateScrollButton();
          return;
        }
        state.appliedItemCoupons = state.appliedItemCoupons || {};
        eligibleItemIds.forEach((id) => {
          const list = state.appliedItemCoupons[id] || [];
          if (!list.includes(normalized)) state.appliedItemCoupons[id] = [...list, normalized];
          else state.appliedItemCoupons[id] = list;
        });
      }
      couponInput.value = "";
      couponInput.placeholder = "Enter coupon code...";
      updateCouponRowState();
      const successHeader = isCartLevel
        ? `Success! Coupon code '${pillLabel}' has been applied to your cart.`
        : `Success! Coupon code '${pillLabel}' has been applied to your cart.`;
      const cartBubble = createCartBubble(state, null, {
        headerText: successHeader,
      });
      chatEl.append(cartBubble);
      scrollChatElementIntoView(cartBubble);
      updateScrollButton();
    } finally {
      couponButton.disabled = false;
      couponInput.disabled = false;
      couponButton.classList.remove("is-loading");
      couponButton.removeAttribute("aria-busy");
    }
  });

  couponInput.addEventListener("input", updateCouponRowState);

  return bubble;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getProductKey(product, fallbackIndex = 0) {
  if (product && product.id != null) {
    return `product-${product.id}`;
  }
  const seed = `${product?.name ?? "product"}-${fallbackIndex}`;
  return `product-${hashString(seed)}`;
}

function pickFrom(list, seed, fallbackIndex = 0) {
  if (!list || list.length === 0) return null;
  const index = seed % list.length;
  return list[index] ?? list[fallbackIndex] ?? list[0];
}

function pickUniqueFrom(list, seed, count = 2) {
  if (!list || list.length === 0) return [];
  const unique = [];
  for (let i = 0; i < list.length && unique.length < count; i += 1) {
    const value = list[(seed + i) % list.length];
    if (value && !unique.includes(value)) {
      unique.push(value);
    }
  }
  return unique;
}

function normalizeLabel(value) {
  if (!value) return "";
  return String(value)
    .split(" ")
    .map((word) =>
      word ? word.charAt(0).toUpperCase() + word.slice(1) : word
    )
    .join(" ");
}

function buildMockCompareAttributes(product) {
  const seedSource = product.id || product.name || "product";
  const seed = hashString(seedSource);
  const skinTypeOptions = [
    "All skin types",
    "Dry",
    "Oily",
    "Combination",
    "Sensitive",
    "Normal",
  ];
  const finishOptions = ["Matte", "Dewy", "Natural", "Radiant"];
  const coverageOptions = ["Light", "Medium", "Full"];
  const concernOptions = [
    "Hydration",
    "Brightening",
    "Dark spots",
    "Texture",
    "Pores",
    "Redness",
    "Firming",
    "Anti-aging",
    "Acne",
  ];
  const resultsTimelineOptions = ["Instant", "2 weeks", "4 weeks+"];
  const textureOptions = ["Lightweight gel", "Rich cream", "Fast-absorbing"];
  const heroIngredientOptions = [
    "Hyaluronic Acid",
    "Retinol",
    "Niacinamide",
    "Peptides",
    "Reishi Extract",
    "Vitamin C",
  ];
  const sizeOptions = ["15 ml", "30 ml", "50 ml", "100 ml"];

  const skinType =
    product.skin_type ||
    pickFrom(skinTypeOptions, seed + 3, 0);
  const finish =
    product.finish ||
    pickFrom(finishOptions, seed + 7, 1);
  const coverage =
    product.coverage ||
    pickFrom(coverageOptions, seed + 11, 1);
  const concern =
    (product.concerns || [])[0] ||
    pickFrom(concernOptions, seed + 13, 0);
  const primaryConcerns =
    (product.concerns || []).slice(0, 3).length > 0
      ? (product.concerns || []).slice(0, 3)
      : pickUniqueFrom(concernOptions, seed + 21, 3);
  const sizeLabel =
    product.size_ml != null ? `${product.size_ml} ml` : pickFrom(sizeOptions, seed + 17, 2);
  const spfValue = product.spf ?? pickFrom([0, 15, 30, 50], seed + 19, 1);
  const fragranceFree =
    product.fragrance_free ?? pickFrom([true, false], seed + 23, 1);
  const vegan = product.vegan ?? pickFrom([true, false], seed + 29, 0);
  const crueltyFree =
    product.cruelty_free ?? pickFrom([true, false], seed + 31, 0);
  const keyIngredients =
    (product.ingredients || []).slice(0, 3).length > 0
      ? (product.ingredients || []).slice(0, 3)
      : pickUniqueFrom(heroIngredientOptions, seed + 37, 3);
  const benefits =
    (product.benefits || []).slice(0, 3).length > 0
      ? (product.benefits || []).slice(0, 3)
      : (product.features || []).slice(0, 3);
  const resultsTimeline =
    product.results_timeline
      ? [product.results_timeline]
      : pickUniqueFrom(resultsTimelineOptions, seed + 41, 3);
  const texture = product.texture || pickFrom(textureOptions, seed + 43, 1);

  return {
    size: sizeLabel,
    skin_type: skinType,
    finish,
    coverage,
    concern,
    spf: spfValue || null,
    fragrance_free: fragranceFree ? "Yes" : "No",
    vegan: vegan ? "Yes" : "No",
    cruelty_free: crueltyFree ? "Yes" : "No",
    key_ingredients: keyIngredients || null,
    benefits: benefits || null,
    primary_concerns: primaryConcerns.length ? primaryConcerns : null,
    results_timeline: resultsTimeline.length ? resultsTimeline : null,
    texture,
    hero_ingredients: keyIngredients || null,
  };
}

function pickBenefit(product) {
  if (product.features && product.features.length > 0) {
    return product.features.slice(0, 2).join(", ");
  }
  return "Great for everyday routines.";
}

function buildCompareHighlights(product) {
  const attrs = product.compare_attributes || {};
  const features = [];
  if (attrs.size) features.push({ label: "Size", value: attrs.size });
  [
    { label: "Skin type", value: attrs.skin_type },
    { label: "Finish", value: attrs.finish },
    { label: "Coverage", value: attrs.coverage },
    { label: "Concern", value: attrs.concern },
    { label: "SPF", value: attrs.spf ? `SPF ${attrs.spf}` : null },
    { label: "Fragrance-free", value: attrs.fragrance_free },
    { label: "Vegan", value: attrs.vegan },
  ].forEach((item) => {
    if (item.value) features.push(item);
  });

  return features.slice(0, 5).map((item) => `${item.label}: ${item.value}`);
}

function buildDetailedComparisonRows(products) {
  const normalizeList = (value, limit = 3) => {
    if (!value) return null;
    if (Array.isArray(value)) {
      const items = value.map((item) => String(item).trim()).filter(Boolean);
      if (items.length === 0) return null;
      return items.slice(0, limit).join(" · ");
    }
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (/[·,|]/.test(trimmed)) {
      const items = trimmed
        .split(/[·,|]/)
        .map((item) => item.trim())
        .filter(Boolean);
      return items.length ? items.slice(0, limit).join(" · ") : null;
    }
    return trimmed;
  };

  const formatSkinTypeList = (value, limit = 4) => {
    if (!value) return null;
    const items = Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean)
      : String(value)
          .split(/[·,|]/)
          .map((item) => item.trim())
          .filter(Boolean);
    if (items.length === 0) return null;
    return items
      .slice(0, limit)
      .map((item) => {
        const lower = item.toLowerCase();
        if (lower.includes("skin") || lower.includes("type")) return item;
        return `${item} skin`;
      })
      .join(" · ");
  };

  const rows = [
    {
      label: "For skin type",
      getValue: (product) =>
        formatSkinTypeList(
          product.compare_attributes?.skin_type || product.skin_type,
          4
        ),
    },
    {
      label: "Primary Skin Concern",
      getValue: (product) =>
        normalizeList(
          product.compare_attributes?.primary_concerns ||
            product.concerns ||
            product.compare_attributes?.concern,
          5
        ),
    },
    {
      label: "Key Benefits",
      getValue: (product) =>
        normalizeList(
          product.compare_attributes?.benefits || product.benefits || product.features,
          3
        ),
    },
    {
      label: "Results",
      getValue: (product) =>
        normalizeList(
          product.results_timeline || product.compare_attributes?.results_timeline,
          3
        ),
      fallbackValue: "3 weeks",
      omitIfAllMissing: true,
    },
    {
      label: "Texture / Finish",
      getValue: (product) =>
        normalizeList(
          product.compare_attributes?.texture ||
            product.texture ||
            product.compare_attributes?.finish,
          3
        ),
    },
  ];

  return rows
    .map((row) => {
      const values = products.map((product) => row.getValue(product));
      if (row.omitIfAllMissing && values.every((value) => !value)) {
        return null;
      }
      const fallbackValue = row.fallbackValue || "Not listed";
      return {
        label: row.label,
        values: values.map((value) => value || fallbackValue),
      };
    })
    .filter(Boolean);
}

function openProductPdp(product) {
  if (!product) return;
  addBubble("user", product.name);
  runWithLatency(() => {
    const pdpBubble = createPdpBubble(product);
    chatEl.append(pdpBubble);
    setupPdpSticky(pdpBubble);
    scrollChatElementIntoView(pdpBubble);
    updateScrollButton();
  });
}

function pickRecommendedProductFromComparison(comparisonProducts) {
  if (!comparisonProducts.length) return null;
  if (comparisonProducts.length === 1) {
    const p = comparisonProducts[0];
    const rating = p.rating ?? p.star_rating;
    return {
      product: p,
      reason: rating != null ? `rated ${Number(rating).toFixed(1)}/5` : "the only product in this comparison",
    };
  }
  const intent = lastDiscoveryIntent || {};
  const normalize = (s) => String(s || "").toLowerCase().trim();

  const scoreIntentMatch = (product) => {
    let score = 0;
    const skinType = normalize(product.compare_attributes?.skin_type ?? product.skin_type);
    const concern = normalize(
      (product.compare_attributes?.primary_concerns ?? product.concerns)?.[0] ??
        product.compare_attributes?.concern ??
        product.concern
    );
    const finish = normalize(product.compare_attributes?.finish ?? product.finish);
    const wantSkin = normalize(intent.skin_type);
    const wantConcern = normalize(intent.concern);
    const wantFinish = normalize(intent.finish);
    if (wantSkin && skinType && skinType.includes(wantSkin)) score += 2;
    if (wantConcern && concern && concern.includes(wantConcern)) score += 2;
    if (wantFinish && finish && finish.includes(wantFinish)) score += 1;
    const concerns = product.compare_attributes?.primary_concerns ?? product.concerns ?? [];
    if (wantConcern && concerns.some((c) => normalize(c).includes(wantConcern))) score += 1;
    return score;
  };

  const withScores = comparisonProducts.map((product) => ({
    product,
    intentScore: scoreIntentMatch(product),
    rating: Number(product.rating ?? product.star_rating ?? 0),
  }));

  const bestIntent = Math.max(...withScores.map((x) => x.intentScore));
  const candidates =
    bestIntent > 0
      ? withScores.filter((x) => x.intentScore === bestIntent)
      : withScores;
  const bestRating = Math.max(...candidates.map((x) => x.rating));
  const chosen = candidates.find((x) => x.rating === bestRating) || candidates[0];
  const p = chosen.product;
  const rating = p.rating ?? p.star_rating;
  let reason;
  if (chosen.intentScore > 0) {
    reason =
      rating != null
        ? `best match for your preferences and highly rated (${Number(rating).toFixed(1)}/5)`
        : "best match for your preferences";
  } else {
    reason =
      rating != null
        ? `highest rated (${Number(rating).toFixed(1)}/5)`
        : "balanced mix of benefits and value";
  }
  return { product: p, reason };
}

function createDetailedComparisonBubble(products) {
  const comparisonProducts = (Array.isArray(products) ? products : [])
    .filter(Boolean)
    .slice(0, MAX_COMPARE_PRODUCTS);
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant comparison-table-bubble";

  const card = document.createElement("div");
  card.className = "card comparison-table-card";

  const title = document.createElement("div");
  title.className = "comparison-table-title";
  title.textContent =
    comparisonProducts.length === 2
      ? "Here's a detailed comparison between the two products."
      : `Here's a detailed comparison between ${comparisonProducts.length} products.`;

  const tableScroll = document.createElement("div");
  tableScroll.className = "comparison-table-scroll";

  const table = document.createElement("div");
  table.className = "comparison-table";
  table.style.setProperty(
    "--comparison-columns",
    String(comparisonProducts.length)
  );

  const buildProductBlockCell = (product, fallbackIndex = 0) => {
    const cell = document.createElement("div");
    cell.className = "comparison-cell comparison-product-block-cell";
    const block = document.createElement("div");
    block.className = "comparison-product-block";

    const { imageUrl, isPlaceholder } = getPrimaryProductImage(
      product,
      fallbackIndex
    );
    const imageWrap = document.createElement("div");
    imageWrap.className = "comparison-product-block-image";
    if (!imageUrl || isPlaceholder) {
      imageWrap.classList.add("comparison-product-block-image--placeholder");
    }
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = product?.name || "Product image";
    img.loading = "lazy";
    imageWrap.append(img);
    block.append(imageWrap);

    const nameLink = document.createElement("a");
    nameLink.className = "comparison-product-block-name";
    nameLink.href = "#";
    nameLink.textContent = product.name || "Product";
    nameLink.setAttribute("aria-label", `View ${product.name || "Product"}`);
    nameLink.addEventListener("click", (event) => {
      event.preventDefault();
      openProductPdp(product);
    });
    block.append(nameLink);

    const priceEl = document.createElement("div");
    priceEl.className = "comparison-product-block-price";
    const priceVal =
      product.price != null
        ? product.price
        : product.compare_attributes?.price;
    priceEl.textContent =
      priceVal != null ? formatPrice(Number(priceVal)) : "—";
    block.append(priceEl);

    const ratingData = buildStarRating(product.rating ?? product.star_rating);
    const reviewCount = formatReviewCount(product.reviews);
    const ratingRow = document.createElement("div");
    ratingRow.className = "comparison-product-block-rating";
    const stars = document.createElement("div");
    stars.className = "comparison-product-block-stars";
    if (ratingData) {
      stars.setAttribute(
        "aria-label",
        `${ratingData.rating.toFixed(1)} out of 5 stars`
      );
      for (let i = 0; i < ratingData.fullStars; i += 1) {
        const star = document.createElement("span");
        star.className = "comparison-product-block-star filled";
        star.textContent = "★";
        stars.append(star);
      }
      if (ratingData.hasHalf) {
        const star = document.createElement("span");
        star.className = "comparison-product-block-star half";
        star.textContent = "★";
        stars.append(star);
      }
      for (let i = 0; i < ratingData.emptyStars; i += 1) {
        const star = document.createElement("span");
        star.className = "comparison-product-block-star empty";
        star.textContent = "★";
        stars.append(star);
      }
      const ratingValue = document.createElement("span");
      ratingValue.className = "comparison-product-block-rating-value";
      ratingValue.textContent = ratingData.rating.toFixed(1);
      ratingRow.append(ratingValue, stars);
    } else {
      stars.setAttribute("aria-label", "No rating");
      for (let i = 0; i < 5; i += 1) {
        const star = document.createElement("span");
        star.className = "comparison-product-block-star empty";
        star.textContent = "★";
        stars.append(star);
      }
      ratingRow.append(stars);
    }
    const reviewText = document.createElement("span");
    reviewText.className = "comparison-product-block-review-count";
    reviewText.textContent = reviewCount ? `(${reviewCount})` : "(0)";
    ratingRow.append(reviewText);
    block.append(ratingRow);

    cell.append(block);
    return cell;
  };

  const productRow = document.createElement("div");
  productRow.className = "comparison-row comparison-product-row";
  const productRowLabel = document.createElement("div");
  productRowLabel.className = "comparison-cell comparison-label";
  productRowLabel.textContent = "Product";
  productRow.append(
    productRowLabel,
    ...comparisonProducts.map((product, index) =>
      buildProductBlockCell(product, index + 1)
    )
  );
  table.append(productRow);

  buildDetailedComparisonRows(comparisonProducts).forEach((row) => {
    const comparisonRow = document.createElement("div");
    comparisonRow.className = "comparison-row";
    const labelCell = document.createElement("div");
    labelCell.className = "comparison-cell comparison-label";
    labelCell.textContent = row.label;
    const valueCells = row.values.map((value) => {
      const cell = document.createElement("div");
      cell.className = "comparison-cell";
      cell.textContent = value;
      return cell;
    });
    comparisonRow.append(labelCell, ...valueCells);
    table.append(comparisonRow);
  });

  const summaryRow = document.createElement("div");
  summaryRow.className = "comparison-row comparison-summary-row";
  const summaryLabel = document.createElement("div");
  summaryLabel.className = "comparison-cell comparison-label";
  summaryLabel.textContent = "Summary";
  const summaryCells = comparisonProducts.map((product) => {
    const cell = document.createElement("div");
    cell.className = "comparison-cell comparison-summary-cell";
    const summaryText =
      product.overview_summary ||
      product.description ||
      product.summary ||
      product.compare_attributes?.description ||
      product.compare_attributes?.summary ||
      "—";
    cell.textContent = cleanKeyBenefitsFromSummary(summaryText);
    return cell;
  });
  summaryRow.append(summaryLabel, ...summaryCells);
  table.append(summaryRow);

  const buildViewCell = (product) => {
    const cell = document.createElement("div");
    cell.className = "comparison-cell comparison-cta-cell";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "comparison-view-button";
    button.setAttribute("aria-label", `View ${product?.name || "product"}`);
    button.addEventListener("click", () => openProductPdp(product));
    const label = document.createElement("span");
    label.className = "comparison-view-label";
    label.textContent = "View product";
    const icon = document.createElement("span");
    icon.className = "comparison-view-icon";
    icon.textContent = "→";
    button.append(label, icon);
    cell.append(button);
    return cell;
  };

  const ctaRow = document.createElement("div");
  ctaRow.className = "comparison-row comparison-cta-row";
  const ctaLabel = document.createElement("div");
  ctaLabel.className = "comparison-cell comparison-label";
  ctaLabel.textContent = "";
  ctaRow.append(
    ctaLabel,
    ...comparisonProducts.map((product) => buildViewCell(product))
  );
  table.append(ctaRow);

  tableScroll.append(table);

  const recommendationData = pickRecommendedProductFromComparison(comparisonProducts);
  const recommendation = document.createElement("div");
  recommendation.className = "comparison-table-recommendation";
  if (recommendationData) {
    recommendation.append("Recommendation: We recommend ");
    const productLink = document.createElement("a");
    productLink.href = "#";
    productLink.className = "comparison-table-recommendation-link";
    productLink.textContent = recommendationData.product.name || "this product";
    productLink.setAttribute("aria-label", `View ${recommendationData.product.name || "product"}`);
    productLink.addEventListener("click", (e) => {
      e.preventDefault();
      openProductPdp(recommendationData.product);
    });
    recommendation.append(productLink);
    recommendation.append(` — ${recommendationData.reason}.`);
  } else {
    recommendation.textContent = "Recommendation: Compare the products above to choose the best fit.";
  }
  card.append(title, tableScroll, recommendation);
  bubble.append(card);
  return bubble;
}

function parseWeightValue(weightLabel) {
  if (!weightLabel) return null;
  const match = String(weightLabel).match(/([\d.]+)/);
  if (!match) return null;
  return parseFloat(match[1]);
}

function buildCompareRecommendation(productA, productB) {
  let winner = productA;
  let runnerUp = productB;
  const reasons = [];
  const ratingA = productA.rating ?? 0;
  const ratingB = productB.rating ?? 0;
  const ratingDiff = ratingA - ratingB;

  if (Math.abs(ratingDiff) >= 0.2) {
    winner = ratingDiff >= 0 ? productA : productB;
    runnerUp = winner === productA ? productB : productA;
    reasons.push(
      `higher rating (${winner.rating.toFixed(1)} vs ${runnerUp.rating.toFixed(1)})`
    );
  }

  const priceA = productA.price ?? null;
  const priceB = productB.price ?? null;
  if (
    reasons.length === 0 &&
    priceA != null &&
    priceB != null &&
    Math.abs(priceA - priceB) >= 10
  ) {
    winner = priceA <= priceB ? productA : productB;
    runnerUp = winner === productA ? productB : productA;
    reasons.push(
      `better value (${formatPrice(winner.price)} vs ${formatPrice(
        runnerUp.price
      )})`
    );
  }

  const spfA = productA.spf ?? productA.compare_attributes?.spf ?? 0;
  const spfB = productB.spf ?? productB.compare_attributes?.spf ?? 0;
  if (reasons.length === 0 && spfA && spfB && Math.abs(spfA - spfB) >= 10) {
    winner = spfA >= spfB ? productA : productB;
    runnerUp = winner === productA ? productB : productA;
    reasons.push(`higher sun protection (SPF ${spfA} vs SPF ${spfB})`);
  }

  if (reasons.length === 0) {
    winner = productA;
    runnerUp = productB;
    reasons.push("balanced mix of benefits and formula performance");
  }

  return { winner, runnerUp, reason: reasons.join(" and ") };
}

function getRecommendationContextLabel(productA, productB) {
  const intentCategory = lastDiscoveryIntent?.product_category;
  if (intentCategory) return intentCategory.replace(/s$/, "");
  const combined = `${productA?.category || ""} ${productB?.category || ""}`.toLowerCase();
  if (combined.includes("skincare")) return "skincare";
  if (combined.includes("makeup")) return "makeup";
  if (combined.includes("haircare")) return "haircare";
  if (combined.includes("fragrance")) return "fragrance";
  return "routine";
}

function createCompareBubble(productA, productB) {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant compare-bubble";

  const card = document.createElement("div");
  card.className = "card compare-card";

  const body = document.createElement("div");
  body.className = "card-body compare-body";

  const title = document.createElement("div");
  title.className = "compare-title";
  title.textContent = "Most certainly, here's a short comparison";

  const buildSection = (product) => {
    const section = document.createElement("div");
    section.className = "compare-section";

    const header = document.createElement("div");
    header.className = "compare-header";

    const thumb = document.createElement("div");
    thumb.className = "compare-thumb";
    const isPlaceholder =
      typeof product.image_url === "string" &&
      product.image_url.includes("placehold.co");
    const thumbUrl =
      product.image_url && !isPlaceholder
        ? product.image_url
        : getFallbackImageUrl(product.name, 2);
    if (thumbUrl) {
      const img = document.createElement("img");
      img.src = thumbUrl;
      img.alt = product.name;
      img.loading = "lazy";
      thumb.append(img);
    } else {
      thumb.classList.add("compare-thumb--placeholder");
      thumb.textContent = (product.name || "P").charAt(0).toUpperCase();
    }

    const headerText = document.createElement("div");
    headerText.className = "compare-header-text";

    const name = document.createElement("div");
    name.className = "card-name compare-product-name";
    name.textContent = product.name;
    name.addEventListener("click", () => openProductPdp(product));

    const subtitle = document.createElement("div");
    subtitle.className = "compare-product-subtitle";
    const categoryLabel = product.category
      ? product.category.split("/").slice(-1)[0]
      : "";
    subtitle.textContent =
      normalizeLabel(categoryLabel) ||
      normalizeLabel(product.product_type) ||
      "Product";

    headerText.append(name, subtitle);

    const arrow = document.createElement("button");
    arrow.type = "button";
    arrow.className = "compare-arrow";
    arrow.setAttribute("aria-label", `View ${product.name}`);
    arrow.textContent = "›";
    arrow.addEventListener("click", () => openProductPdp(product));

    header.append(thumb, headerText, arrow);

    const summary = document.createElement("div");
    summary.className = "compare-summary";
    const fallbackSummary = buildCompareHighlights(product).join(". ");
    const rawSummary =
      product.overview_summary ||
      product.overview ||
      product.description ||
      fallbackSummary;
    summary.textContent = cleanKeyBenefitsFromSummary(rawSummary);

    section.append(header, summary);
    return section;
  };

  const recommendation = document.createElement("div");
  recommendation.className = "compare-recommendation";
  const recommendationTitle = document.createElement("div");
  recommendationTitle.className = "compare-recommendation-title";
  const recommendationContext = getRecommendationContextLabel(productA, productB);
  recommendationTitle.textContent = `Recommendation for ${recommendationContext}`;
  const recommendationBody = document.createElement("div");
  recommendationBody.className = "compare-recommendation-body";
  const recommendationMeta = buildCompareRecommendation(productA, productB);
  const highlight = document.createElement("span");
  highlight.className = "compare-highlight";
  highlight.textContent = recommendationMeta.winner.name;
  highlight.addEventListener("click", () =>
    openProductPdp(recommendationMeta.winner)
  );
  recommendationBody.append(
    "Go with the ",
    highlight,
    ` — it offers ${recommendationMeta.reason}.`
  );
  recommendation.append(recommendationTitle, recommendationBody);

  const actionPills = document.createElement("div");
  actionPills.className = "chips compare-action-chips";
  actionPills.innerHTML = `
    <button class="chip" data-prompt="Detailed comparison">Detailed comparison</button>
    <button class="chip" data-prompt="Suggest similar">Suggest similar</button>
    <button class="chip" data-prompt="Show skincare bestsellers">Show skincare bestsellers</button>
  `;
  actionPills.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    hideNbaPillSet(actionPills);
    const prompt = button.dataset.prompt;
    if (!prompt) return;
    if (prompt === "Detailed comparison") {
      addBubble("user", prompt);
      runWithLatency(() => {
        chatEl.append(createDetailedComparisonBubble([productA, productB]));
        updateScrollButton();
      });
      return;
    }
    searchInput.value = prompt;
    handleSearch();
  });

  body.append(title, buildSection(productA), buildSection(productB), recommendation);
  card.append(body);
  bubble.append(card, actionPills);
  return bubble;
}

function matchesQuery(product, query) {
  if (!query) return true;
  const normalized = query.toLowerCase();
  const synonymMap = {
    glow: ["radiance", "brightening", "luminous"],
    brightening: ["glow", "radiance"],
    hydrate: ["hydrating", "moisturizing", "moisture"],
    hydrating: ["hydrate", "moisturizing"],
    moisturizer: ["moisturizing", "cream", "hydrating"],
    serum: ["treatment", "concentrate", "ampoule"],
    cleanser: ["cleanser", "wash", "foam", "gel"],
    toner: ["essence", "mist"],
    sunscreen: ["spf", "sun protection"],
    antiaging: ["anti-aging", "firming", "wrinkle"],
    acne: ["blemish", "breakout", "oil control"],
    oily: ["oil-control", "shine", "matte"],
    matte: ["oil control", "shine control"],
    dewy: ["glow", "radiance", "luminous"],
    fragrancefree: ["unscented", "fragrance-free"],
    vegan: ["cruelty-free", "plant-based"],
  };

  const haystack = [
    product.name,
    product.category,
    product.product_type,
    product.description,
    product.composition,
    ...(product.features || []),
    ...(product.benefits || []),
    ...(product.ingredients || []),
    ...(product.collections || []),
    ...(product.categories || []),
    ...(product.concerns || []),
    ...(product.skin_type ? [product.skin_type] : []),
    ...(product.finish ? [product.finish] : []),
    ...(product.coverage ? [product.coverage] : []),
    ...(product.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const stopWords = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "for",
    "of",
    "in",
    "on",
    "with",
    "without",
    "my",
    "me",
    "i",
    "you",
    "your",
    "need",
    "want",
    "show",
    "best",
    "bestsellers",
    "recommend",
    "recommendations",
    "find",
    "looking",
    "routine",
    "set",
    "collection",
    "collections",
    "concern",
    "concerns",
    "category",
    "categories",
  ]);

  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !stopWords.has(token));

  if (tokens.length === 0) return true;

  return tokens.every((token) => {
    if (!token) return true;
    if (haystack.includes(token)) return true;
    const synonyms = synonymMap[token];
    if (!synonyms) return false;
    return synonyms.some((syn) => haystack.includes(syn));
  });
}

function applyFilter(products) {
  if (!activeFilter) return products;

  switch (activeFilter) {
    case "under25":
      return products.filter((p) => p.price <= 25);
    case "under50":
      return products.filter((p) => p.price <= 50);
    case "vegan":
      return products.filter((p) => p.vegan);
    case "fragranceFree":
      return products.filter((p) => p.fragrance_free);
    case "sensitive":
      return products.filter((p) => (p.skin_type || "").toLowerCase() === "sensitive");
    case "bestRated":
      return products.filter((p) => p.rating && p.rating >= 4.5);
    case "more":
      return shuffle(products).slice(0, 10);
    default:
      return products;
  }
}

function applyGenderFilter(products) {
  if (!activeGender) return products;
  return products.filter((product) => product.gender === activeGender);
}

function applyIntentFilters(products, intentFilters) {
  if (!intentFilters) return products;
  let filtered = products;
  const intent = intentFilters?.discoveryIntent || {};

  if (intent.product_category) {
    const category = intent.product_category.toLowerCase();
    filtered = filtered.filter((product) => {
      const haystack = `${product.category || ""} ${product.product_type || ""}`.toLowerCase();
      return haystack.includes(category);
    });
  }

  if (intent.skin_type) {
    const wanted = intent.skin_type.toLowerCase();
    filtered = filtered.filter(
      (product) => (product.skin_type || "").toLowerCase().includes(wanted)
    );
  }

  if (intent.concern) {
    const target = intent.concern.toLowerCase();
    filtered = filtered.filter((product) => {
      const concerns = (product.concerns || []).map((item) => String(item).toLowerCase());
      const benefits = (product.benefits || []).map((item) => String(item).toLowerCase());
      return concerns.some((c) => c.includes(target)) || benefits.some((item) => item.includes(target));
    });
  }

  if (intent.finish) {
    const finish = intent.finish.toLowerCase();
    filtered = filtered.filter(
      (product) => (product.finish || "").toLowerCase().includes(finish)
    );
  }

  if (intent.coverage) {
    const coverage = intent.coverage.toLowerCase();
    filtered = filtered.filter(
      (product) => (product.coverage || "").toLowerCase().includes(coverage)
    );
  }

  if (intent.spf_min != null) {
    filtered = filtered.filter((product) => (product.spf || 0) >= intent.spf_min);
  }

  if (intent.fragrance_free) {
    filtered = filtered.filter((product) => product.fragrance_free);
  }

  if (intent.vegan) {
    filtered = filtered.filter((product) => product.vegan);
  }

  return filtered;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function addBubble(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  chatEl.append(bubble);
  conversation.push({ role, text });
  updateScrollButton();
}

function buildFilterChipsRow() {
  const chipRow = document.createElement("div");
  chipRow.className = "chips";
  const filters = [
    { key: "under25", label: "under $25" },
    { key: "under50", label: "under $50" },
    { key: "fragranceFree", label: "fragrance free" },
    { key: "sensitive", label: "sensitive skin" },
    { key: "vegan", label: "vegan" },
    { key: "bestRated", label: "best rated" },
    { key: "more", label: "more suggestions" },
  ];

  const visibleFilters = filters.filter((filter) => filter.key !== activeFilter);
  chipRow.innerHTML = visibleFilters
    .map(
      (filter) =>
        `<button class="chip" data-filter="${filter.key}">${filter.label}</button>`
    )
    .join("");
  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const filterKey = button.dataset.filter || null;
    activeFilter = filterKey;
    addBubble("user", button.textContent.trim());
    hideNbaPillSet(chipRow);
    runSearch(lastQuery, null, false, lastIntentFilters);
  });
  return chipRow;
}

function buildBackpackWeatherChipsRow() {
  const chipRow = document.createElement("div");
  chipRow.className = "chips";
  const options = [
    { key: "dry", label: "Sunny & dry" },
    { key: "rain", label: "Rainy" },
    { key: "snow", label: "Snowy" },
    { key: "wind", label: "Windy" },
  ];
  chipRow.innerHTML = options
    .map(
      (option) =>
        `<button class="chip" data-weather="${option.key}">${option.label}</button>`
    )
    .join("");
  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const weather = button.dataset.weather || "";
    if (!weather) return;
    addBubble("user", button.textContent.trim());
    hideNbaPillSet(chipRow);
    const nextIntent = {
      ...(lastIntentFilters || {}),
      discoveryIntent: {
        ...(lastDiscoveryIntent || {}),
        product_category: lastDiscoveryIntent?.product_category || "backpacks",
        duration_days: lastDiscoveryIntent?.duration_days,
        environment: [weather],
      },
    };
    runSearch(lastQuery, null, false, nextIntent);
  });
  return chipRow;
}

function buildSingleSelectionChipsRow(product) {
  const chipRow = document.createElement("div");
  chipRow.className = "chips";
  const faqAction = buildPdpFaqActions(product)[0] || {
    key: "faq",
    label: "FAQ question",
  };
  const actions = [
    { key: "show-similar", label: "Show similar" },
    { key: "suggest-pairing", label: "Suggest pairing" },
    { key: faqAction.key, label: faqAction.label, actionType: "faq" },
  ];
  chipRow.innerHTML = actions
    .map(
      (action) =>
        `<button class="chip" data-action-type="${action.actionType || "selection"}" data-action-key="${action.key}">
          ${action.label}
        </button>`
    )
    .join("");
  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const label = button.textContent.trim();
    addBubble("user", label);
    hideNbaPillSet(chipRow);
    if (button.dataset.actionType === "faq") {
      runWithLatency(() => {
        chatEl.append(createFaqAnswerBubble(product, button.dataset.actionKey));
        chatEl.append(createPdpFollowupChipsRow(product, button.dataset.actionKey));
        updateScrollButton();
      });
    }
  });
  return chipRow;
}

function buildCompareChipsRow() {
  const chipRow = document.createElement("div");
  chipRow.className = "chips";
  chipRow.innerHTML = `<button class="chip" data-action-type="compare">Compare</button>`;
  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    hideNbaPillSet(chipRow);
    const selectedProducts = [...selectedPlpProducts.values()].slice(
      0,
      MAX_COMPARE_PRODUCTS
    );
    if (selectedProducts.length < 2) {
      addBubble("user", button.textContent.trim());
      runWithLatency(() => {
        addBubble(
          "assistant",
          `Select at least two products to compare (up to ${MAX_COMPARE_PRODUCTS}).`
        );
      });
      return;
    }
    const compareLabel = `Compare: ${selectedProducts
      .map((product) => product.name)
      .join(" vs ")}`;
    addBubble("user", compareLabel);
    runWithLatency(() => {
      if (selectedProducts.length === 2) {
        chatEl.append(
          createCompareBubble(selectedProducts[0], selectedProducts[1])
        );
      } else {
        chatEl.append(createDetailedComparisonBubble(selectedProducts));
      }
      updateScrollButton();
    });
  });
  return chipRow;
}

function renderNextBestActions() {
  const existing = chatEl.querySelector(".chips");
  if (existing) existing.remove();

  let chipRow = null;
  if (selectedPlpProducts.size >= 2) {
    chipRow = buildCompareChipsRow();
  } else if (selectedPlpProducts.size === 1) {
    const [product] = selectedPlpProducts.values();
    chipRow = buildSingleSelectionChipsRow(product);
  } else {
    chipRow = buildFilterChipsRow();
  }

  hideNbaPillSets(chipRow);
  chatEl.append(chipRow);
}

function addBackpackWeatherPrompt() {
  const existing = chatEl.querySelector(".chips");
  if (existing) existing.remove();
  const chipRow = buildBackpackWeatherChipsRow();
  hideNbaPillSets(chipRow);
  chatEl.append(chipRow);
}

function updateSelectedPlpProducts(productKey, product, isSelected) {
  if (!productKey) return true;
  if (isSelected) {
    if (
      !selectedPlpProducts.has(productKey) &&
      selectedPlpProducts.size >= MAX_COMPARE_PRODUCTS
    ) {
      addBubble(
        "assistant",
        `You can compare up to ${MAX_COMPARE_PRODUCTS} products at once.`
      );
      return false;
    }
    selectedPlpProducts.set(productKey, product);
  } else {
    selectedPlpProducts.delete(productKey);
  }
  renderNextBestActions();
  return true;
}

const NBA_PILL_SELECTOR =
  ".pdp-action-chips, .pdp-followup-chips-row, .starter-chips, .chips:not(.roomba-chips)";

function hideNbaPillSets(exceptNode) {
  document.querySelectorAll(NBA_PILL_SELECTOR).forEach((node) => {
    if (node !== exceptNode) {
      node.classList.add("nba-pills-hidden");
    }
  });
}

function hideNbaPillSet(node) {
  if (!node) return;
  node.classList.add("nba-pills-hidden");
}

function getScrollMetrics() {
  const chatScrollable = chatEl.scrollHeight > chatEl.clientHeight + 4;
  if (chatScrollable) {
    return {
      scrollTop: chatEl.scrollTop,
      scrollHeight: chatEl.scrollHeight,
      clientHeight: chatEl.clientHeight,
      scrollToBottom: () =>
        chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: "smooth" }),
    };
  }
  const doc = document.documentElement;
  return {
    scrollTop: doc.scrollTop || document.body.scrollTop,
    scrollHeight: doc.scrollHeight,
    clientHeight: doc.clientHeight,
    scrollToBottom: () =>
      window.scrollTo({ top: doc.scrollHeight, behavior: "smooth" }),
  };
}

function updateScrollButton() {
  const metrics = getScrollMetrics();
  const atBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight < 8;
  const hasOverflow = metrics.scrollHeight - metrics.clientHeight > 12;
  scrollToBottomBtn.classList.toggle("visible", hasOverflow && !atBottom);
}

function scrollChatElementIntoView(node) {
  if (!node) return;
  window.requestAnimationFrame(() => {
    if (!node.isConnected) return;
    const bottomOffset = 16;
    const footer = document.querySelector(".input-bar");
    const footerHeight = footer
      ? footer.getBoundingClientRect().height
      : 0;
    const chatScrollable = chatEl.scrollHeight > chatEl.clientHeight + 4;
    const viewportHeight = chatScrollable
      ? chatEl.clientHeight
      : window.innerHeight;
    const card =
      node.querySelector?.(".pdp-card, .comparison-table-card, .card") || node;
    const cardHeight = card.offsetHeight || node.offsetHeight || 0;
    const isTallCard = cardHeight > viewportHeight;
    const chatPaddingTop = chatScrollable
      ? parseFloat(window.getComputedStyle(chatEl).paddingTop) || 0
      : 0;
    const header = document.querySelector(".top-bar");
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const baseTopOffset = 16;
    const topOffset = chatScrollable
      ? Math.max(chatPaddingTop, baseTopOffset)
      : headerHeight + baseTopOffset;

    if (chatScrollable) {
      if (isTallCard) {
        const targetTop = node.offsetTop - topOffset;
        chatEl.scrollTo({
          top: Math.max(0, targetTop),
          behavior: "smooth",
        });
      } else {
        const targetTop =
          node.offsetTop +
          node.offsetHeight -
          (chatEl.clientHeight - bottomOffset);
        chatEl.scrollTo({
          top: Math.max(0, targetTop),
          behavior: "smooth",
        });
      }
    } else {
      const rect = node.getBoundingClientRect();
      if (isTallCard) {
        const targetY = window.scrollY + rect.top - topOffset;
        window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
      } else {
        const targetY =
          window.scrollY +
          rect.bottom -
          (window.innerHeight - footerHeight - bottomOffset);
        if (targetY > window.scrollY) {
          window.scrollTo({ top: targetY, behavior: "smooth" });
        }
      }
    }

    updateScrollButton();
  });
}

function addLoadingBubble(message = "Looking for products...") {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant loading-bubble";
  bubble.innerHTML = `
    <span class="spinner" aria-hidden="true"></span>
    <span>${message}</span>
  `;
  chatEl.append(bubble);
  updateScrollButton();
  return bubble;
}

function addIntroSection() {
  const intro = document.createElement("div");
  intro.className = "bubble assistant intro-bubble";
  intro.innerHTML = `
    <div class="intro-hero" aria-hidden="true">
      <img class="intro-hero-image" src="Shiseido_Banner.png" alt="" />
    </div>
    <div class="intro-body">
      <div class="intro-title">Hello there!</div>
      <div class="intro-text">
        I'm your beauty care assistant. I can help you discover skincare,
        makeup, haircare, and fragrance picks tailored to your routine. What
        are you shopping for today?
      </div>
    </div>
  `;
  chatEl.append(intro);
  updateScrollButton();

  const starters = document.createElement("div");
  starters.className = "starter-chips";
  starters.innerHTML = `
    <button class="chip chip-wide" data-prompt="Shop by skin concern">
      Shop by skin concern
    </button>
    <button class="chip chip-wide" data-prompt="Find a dewy foundation for me">
      Find a dewy foundation for me
    </button>
    <button class="chip chip-wide" data-prompt="Best SPF for sensitive skin">
      Best SPF for sensitive skin
    </button>
    <div class="starter-row">
      <button class="chip" data-prompt="Track my recent order">Track my recent order</button>
      <button class="chip chip-icon" data-prompt="More suggestions" aria-label="More suggestions">
        ↻
      </button>
    </div>
  `;
  hideNbaPillSets(starters);
  starters.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    hideNbaPillSet(starters);
    const prompt = button.dataset.prompt;
    if (!prompt) return;
    if (prompt === "Shop by skin concern") {
      addBubble("user", prompt);
      runWithLatency(
        () => {
          addSkinConcernPrompt();
        },
        LATENCY_MS,
        "Finding concerns..."
      );
      return;
    }
    searchInput.value = prompt;
    handleSearch();
  });
  chatEl.append(starters);
  updateScrollButton();
}

function assistantCopy(query, count) {
  if (!query) {
    return "Here are a few popular picks to get you started.";
  }
  return `Thanks for your patience. I found ${count} options for “${query}”.`;
}

const LATENCY_MS = 2000;

function runWithLatency(action, delay = LATENCY_MS, loadingText) {
  const loadingBubble = addLoadingBubble(loadingText);
  setTimeout(() => {
    loadingBubble.remove();
    action();
    const last = chatEl.lastElementChild;
    if (last) scrollChatElementIntoView(last);
    updateScrollButton();
  }, delay);
}

function addCategoryClarifyPrompt() {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant";

  const question = document.createElement("div");
  question.textContent =
    "Didn't quite catch that. Would you mind rephrasing? You can also select from one of the options below.";

  const chipRow = document.createElement("div");
  chipRow.className = "chips";
  const options = [
    "Hydrating serum",
    "SPF 50 sunscreen",
    "Matte foundation",
    "Repairing hair mask",
    "Fresh fragrance",
  ];
  chipRow.innerHTML = options
    .map((label) => `<button class="chip">${label}</button>`)
    .join("");

  hideNbaPillSets(chipRow);
  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const label = button.textContent.trim();
    addBubble("user", label);
    hideNbaPillSet(chipRow);
    const intent = parseIntent(label);
    runSearch(intent.queryText || label, null, false, {
      discoveryIntent: intent.discoveryIntent,
    });
  });

  bubble.append(question);
  chatEl.append(bubble, chipRow);
  scrollChatElementIntoView(chatEl.lastElementChild);
  updateScrollButton();
}

function addReturnPolicyAnswer() {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant faq-answer-bubble";
  const body = document.createElement("div");
  body.className = "faq-answer";
  body.innerHTML =
    "Return gently used product(s) within <strong>30 days</strong> of receipt. We can’t offer exchanges right now. Use the prepaid label in your package and drop off at any USPS or FedEx location. Only items bought on Shiseido.com can be returned—not items from other retailers. " +
    '<a href="' +
    SHISEIDO_RETURNS_URL +
    '" target="_blank" rel="noopener">Full return policy</a>';
  bubble.append(body);

  const chipRow = document.createElement("div");
  chipRow.className = "chips";
  const followupLabels = Object.keys(RETURN_POLICY_FOLLOWUPS);
  chipRow.innerHTML = followupLabels
    .map((label) => `<button class="chip">${label}</button>`)
    .join("");

  hideNbaPillSets(chipRow);
  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const question = button.textContent.trim();
    addBubble("user", question);
    hideNbaPillSet(chipRow);
    const answerHtml = RETURN_POLICY_FOLLOWUPS[question];
    if (answerHtml) {
      runWithLatency(() => {
        const answerBubble = document.createElement("div");
        answerBubble.className = "bubble assistant faq-answer-bubble";
        const answerEl = document.createElement("div");
        answerEl.className = "faq-answer";
        answerEl.innerHTML = answerHtml;
        answerBubble.append(answerEl);
        chatEl.append(answerBubble);
        scrollChatElementIntoView(chatEl.lastElementChild);
        updateScrollButton();
      }, LATENCY_MS, "Looking that up...");
    }
  });

  chatEl.append(bubble, chipRow);
  scrollChatElementIntoView(chatEl.lastElementChild);
  updateScrollButton();
}

function addSkinConcernPrompt() {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant";
  bubble.textContent =
    "All skin types are unique and so are their concerns. Let me know if you are facing any or choose from suggested below.";

  const chipRow = document.createElement("div");
  chipRow.className = "chips";
  const options = [
    { label: "Anti-Aging", query: "anti-aging" },
    { label: "Dullness & Dark Spots", query: "dullness dark spots" },
    { label: "Fine Lines & Wrinkles", query: "fine lines wrinkles" },
    { label: "Lifting & Firming", query: "lifting firming" },
    { label: "Dryness & Dehydration", query: "dryness dehydration" },
    { label: "Oil Control", query: "oil control" },
  ];
  chipRow.innerHTML = options
    .map(
      ({ label, query }) =>
        `<button class="chip" data-query="${query}">${label}</button>`
    )
    .join("");

  hideNbaPillSets(chipRow);
  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const label = button.textContent.trim();
    const query = button.dataset.query || label;
    addBubble("user", label);
    hideNbaPillSet(chipRow);
    const intent = parseIntent(query);
    runSearch(intent.queryText || query, null, false, {
      discoveryIntent: intent.discoveryIntent,
    });
  });

  chatEl.append(bubble, chipRow);
  scrollChatElementIntoView(chatEl.lastElementChild);
  updateScrollButton();
}

function shouldShowClarifyPrompt(query, results, intentFilters) {
  if (!query || results.length > 0) return false;
  if (intentFilters?.discoveryIntent?.product_category) return false;
  const normalized = query.toLowerCase().trim();
  if (!normalized) return false;
  const hasKnownCategoryToken =
    /skincare|skin care|makeup|cosmetics|haircare|hair care|fragrance|perfume|sunscreen|spf|serum|moisturizer|cleanser|foundation|lip|mascara|mask/.test(
      normalized
    );
  return !hasKnownCategoryToken;
}


function addRoombaMessQuestion() {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant roomba-bubble";

  const question = document.createElement("div");
  question.className = "roomba-question";
  question.textContent =
    "Sure. Where is this mess coming from? Select all that apply for your home.";

  const chipRow = document.createElement("div");
  chipRow.className = "chips roomba-chips";
  const options = [
    "Kids",
    "Pets",
    "Shedding pets",
    "Adults",
    "Construction",
    "Sand nearby",
    "Hair and lint",
    "Dust due to traffic",
  ];
  chipRow.innerHTML = options
    .map((label) => `<button class="chip roomba-option">${label}</button>`)
    .join("");

  const actions = document.createElement("div");
  actions.className = "roomba-actions";

  const clearBtn = document.createElement("button");
  clearBtn.className = "roomba-action";
  clearBtn.textContent = "Clear";
  clearBtn.disabled = true;

  const proceedBtn = document.createElement("button");
  proceedBtn.className = "roomba-action primary";
  proceedBtn.textContent = "Proceed";
  proceedBtn.disabled = true;

  actions.append(clearBtn, proceedBtn);
  bubble.append(question, chipRow, actions);
  chatEl.append(bubble);
  scrollChatElementIntoView(chatEl.lastElementChild);
  updateScrollButton();

  const updateProceedState = () => {
    const hasSelection =
      chipRow.querySelectorAll(".roomba-option.selected").length > 0;
    proceedBtn.disabled = !hasSelection;
    clearBtn.disabled = !hasSelection;
  };

  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".roomba-option");
    if (!button) return;
    button.classList.toggle("selected");
    updateProceedState();
  });

  clearBtn.addEventListener("click", () => {
    chipRow.querySelectorAll(".roomba-option.selected").forEach((btn) => {
      btn.classList.remove("selected");
    });
    updateProceedState();
  });

  proceedBtn.addEventListener("click", () => {
    const selections = [
      ...chipRow.querySelectorAll(".roomba-option.selected"),
    ].map((btn) => btn.textContent.trim());
    if (selections.length === 0) return;

    addBubble("user", selections.join(", "));

    chipRow.querySelectorAll("button").forEach((btn) => {
      btn.disabled = true;
    });
    clearBtn.disabled = true;
    proceedBtn.disabled = true;

    runWithLatency(() => {
      addRoombaLevelQuestion(selections);
    });
  });
}

function addRoombaLevelQuestion(selections) {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant roomba-bubble";

  const acknowledgement = document.createElement("div");
  acknowledgement.className = "roomba-question";
  acknowledgement.textContent = `I feel bad too, seeing the mess created by ${selections.join(
    ", "
  )}. Select the level of filth in your house. You can select from 1 to 8.`;

  const trigger = document.createElement("button");
  trigger.className = "roomba-level-trigger";
  trigger.textContent = "Select level";

  bubble.append(acknowledgement, trigger);
  chatEl.append(bubble);
  scrollChatElementIntoView(chatEl.lastElementChild);
  updateScrollButton();

  trigger.addEventListener("click", () => {
    openRoombaLevelSheet();
  });
}

function openRoombaLevelSheet() {
  const overlay = document.createElement("div");
  overlay.className = "bottom-sheet-overlay";

  const sheet = document.createElement("div");
  sheet.className = "bottom-sheet";

  const handle = document.createElement("div");
  handle.className = "bottom-sheet-handle";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "bottom-sheet-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";

  const title = document.createElement("div");
  title.className = "bottom-sheet-title";
  title.textContent = "Level of dirt";

  const list = document.createElement("div");
  list.className = "bottom-sheet-list";
  const options = [
    "1. Squeaky clean",
    "2. Somewhat mess",
    "3. Small food crumbs around",
    "4. Garbage and hair lying around",
    "5. Food spilled on floor",
    "6. Kids toys, food crumbs, dirt",
    "7. Mud, garbage, Old food",
    "8. No hope",
  ];
  options.forEach((label) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "bottom-sheet-option";
    item.innerHTML = `
      <span class="option-text">${label}</span>
      <span class="option-radio"></span>
    `;
    list.append(item);
  });

  const actions = document.createElement("div");
  actions.className = "bottom-sheet-actions";

  const clearBtn = document.createElement("button");
  clearBtn.className = "roomba-action";
  clearBtn.textContent = "Clear";
  clearBtn.disabled = true;

  const proceedBtn = document.createElement("button");
  proceedBtn.className = "roomba-action primary";
  proceedBtn.textContent = "Proceed";
  proceedBtn.disabled = true;

  actions.append(clearBtn, proceedBtn);
  sheet.append(handle, closeBtn, title, list, actions);
  overlay.append(sheet);
  document.body.append(overlay);

  const updateState = () => {
    const selected = list.querySelector(".bottom-sheet-option.selected");
    const hasSelection = Boolean(selected);
    clearBtn.disabled = !hasSelection;
    proceedBtn.disabled = !hasSelection;
  };

  list.addEventListener("click", (event) => {
    const item = event.target.closest(".bottom-sheet-option");
    if (!item) return;
    list.querySelectorAll(".bottom-sheet-option").forEach((btn) => {
      btn.classList.remove("selected");
    });
    item.classList.add("selected");
    updateState();
  });

  clearBtn.addEventListener("click", () => {
    list.querySelectorAll(".bottom-sheet-option").forEach((btn) => {
      btn.classList.remove("selected");
    });
    updateState();
  });

  proceedBtn.addEventListener("click", () => {
    const selected = list.querySelector(".bottom-sheet-option.selected");
    if (!selected) return;
    const label = selected.querySelector(".option-text").textContent.trim();
    addBubble("user", label);
    overlay.remove();
    runWithLatency(() => {
      addBubble("assistant", "Go ahead.");
      const roombaProduct = {
        name: "Roomba 7 Series Vacuum Cleaner",
        price: 1100,
        msrp: null,
        colors: ["white"],
        image_url: null,
        features: ["Vacuum cleaner"],
      };
      chatEl.append(
        renderCarouselPage(
          [roombaProduct],
          "Here is the recommended vacuum cleaner.",
          0
        )
      );
      scrollChatElementIntoView(chatEl.lastElementChild);
      updateScrollButton();
    }, LATENCY_MS, "Finding recommendations...");
  });

  closeBtn.addEventListener("click", () => {
    overlay.remove();
  });
}

function buildSelectionsSummary(query) {
  const parts = [];
  if (query) parts.push(`Goal: ${query}`);
  parts.push(`Skin type: ${selectedGenderLabel || "Not specified"}`);
  parts.push(`Finish: ${selectedDurationLabel || "Not specified"}`);
  parts.push(`Concern: ${selectedClimateLabel || "Not specified"}`);
  parts.push(`Preferences: ${selectedSupportLabel || "Not specified"}`);
  return `Thanks for your patience — you've answered all the questions. Here's what I noted: ${parts.join(
    "; "
  )}.`;
}

function showFinalRecommendations(query, intentFilters) {
  const existing = chatEl.querySelector(".chips");
  if (existing) existing.remove();

  const loadingBubble = addLoadingBubble("Finding recommendations...");

  let results = allProducts.filter((p) => matchesQuery(p, query));
  results = applyGenderFilter(results);
  results = applyFilter(results);
  results = applyIntentFilters(results, intentFilters || lastIntentFilters);
  results = results.slice(0, 5);

  setTimeout(() => {
    loadingBubble.remove();
    addBubble("assistant", buildSelectionsSummary(query));
    if (results.length === 0) {
      addBubble(
        "assistant",
        "I couldn't find matching products for those answers. Want to tweak any of the choices?"
      );
      scrollChatElementIntoView(chatEl.lastElementChild);
      updateScrollButton();
      return;
    }

    chatEl.append(
      renderCarouselPage(results, "Here are five recommendations based on your answers.", 0)
    );
    scrollChatElementIntoView(chatEl.lastElementChild);
    updateScrollButton();
  }, LATENCY_MS);
}

function parseIntent(rawQuery) {
  const normalized = rawQuery.toLowerCase();
  let cleaned = rawQuery;
  const categoryMatch = normalized.match(
    /\b(skincare|skin care|makeup|cosmetics|haircare|hair care|fragrance|perfume|tools|beauty tools)\b/
  );
  const productCategory = categoryMatch
    ? categoryMatch[1].replace(" ", "")
    : null;

  const skinTypeMatch = normalized.match(
    /\b(oily|dry|combination|combo|sensitive|normal)\b/
  );
  const concernMatch = normalized.match(
    /\b(acne|blemish|breakout|redness|dark spots|brightening|dullness|wrinkle|anti-aging|hydration|pores)\b/
  );
  const finishMatch = normalized.match(/\b(matte|dewy|natural|radiant)\b/);
  const coverageMatch = normalized.match(/\b(light|medium|full)\s*coverage\b/);
  const spfMatch = normalized.match(/\bspf\s*(\d{2})\b/);
  const wantsFragranceFree = /\bfragrance[-\s]*free|unscented\b/.test(normalized);
  const wantsVegan = /\bvegan|cruelty[-\s]*free\b/.test(normalized);

  const skinType = skinTypeMatch ? skinTypeMatch[1].replace("combo", "combination") : null;
  const concern = concernMatch ? concernMatch[1] : null;
  const finish = finishMatch ? finishMatch[1] : null;
  const coverage = coverageMatch ? coverageMatch[1] : null;
  const spfMin = spfMatch ? parseInt(spfMatch[1], 10) : null;

  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return {
    queryText: cleaned,
    discoveryIntent: {
      product_category: productCategory || undefined,
      skin_type: skinType || undefined,
      concern: concern || undefined,
      finish: finish || undefined,
      coverage: coverage || undefined,
      spf_min: spfMin || undefined,
      fragrance_free: wantsFragranceFree || undefined,
      vegan: wantsVegan || undefined,
    },
  };
}

function createCarouselBubble(products, message) {
  const wrapper = document.createElement("div");
  wrapper.className = "bubble assistant carousel-bubble";

  const handleProductSelection = (product) => {
    if (!product) return;
    addBubble("user", product.name);
    runWithLatency(() => {
      const pdpBubble = createPdpBubble(product);
      chatEl.append(pdpBubble);
      setupPdpSticky(pdpBubble);
      scrollChatElementIntoView(pdpBubble);
      updateScrollButton();
    });
  };

  if (message) {
    const text = document.createElement("div");
    text.className = "carousel-message";
    text.textContent = message;
    wrapper.append(text);
  }

  if (products.length === 0) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.innerHTML =
      '<div class="card-body">No results. Try another query.</div>';
    wrapper.append(empty);
    return wrapper;
  }

  const carouselShell = document.createElement("div");
  carouselShell.className = "carousel-shell";

  const carouselEl = document.createElement("div");
  carouselEl.className = "carousel";

  const leftArrow = document.createElement("button");
  leftArrow.className = "carousel-arrow left";
  leftArrow.setAttribute("aria-label", "Previous");
  leftArrow.textContent = "‹";

  const rightArrow = document.createElement("button");
  rightArrow.className = "carousel-arrow right";
  rightArrow.setAttribute("aria-label", "Next");
  rightArrow.textContent = "›";

  const dotsEl = document.createElement("div");
  dotsEl.className = "carousel-dots";

  products.forEach((product, index) => {
    const card = document.createElement("div");
    card.className = "card product-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.dataset.productIndex = String(index);
    const productKey = getProductKey(product, index);
    card.dataset.productKey = productKey;

    const image = document.createElement("div");
    image.className = "card-image";
    const selectLabel = document.createElement("label");
    selectLabel.className = "plp-select";
    const selectInput = document.createElement("input");
    selectInput.type = "checkbox";
    selectInput.className = "plp-select-input";
    selectInput.setAttribute("aria-label", "Select product");
    selectInput.checked = selectedPlpProducts.has(productKey);
    selectLabel.append(selectInput);
    image.append(selectLabel);
    selectLabel.addEventListener("click", (event) => event.stopPropagation());
    selectInput.addEventListener("click", (event) => event.stopPropagation());
    selectInput.addEventListener("change", (event) => {
      event.stopPropagation();
      const didUpdate = updateSelectedPlpProducts(
        productKey,
        product,
        selectInput.checked
      );
      if (!didUpdate) {
        selectInput.checked = false;
      }
    });
    const fallbackImage = getFallbackImageUrl(product.name, index);
    const carouselImages = getProductCarouselImages(product, fallbackImage);
    const primaryImage = carouselImages[0] || fallbackImage;
    const isPlaceholder =
      typeof primaryImage === "string" && primaryImage.includes("placehold.co");
    const imageUrl = !isPlaceholder ? primaryImage : fallbackImage;
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = product.name;
      img.loading = "lazy";
      image.append(img);
    } else {
      image.classList.add("image-empty");
    }

    const body = document.createElement("div");
    body.className = "card-body";

    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = product.name;

    const benefit = document.createElement("div");
    benefit.className = "card-benefit";
    benefit.textContent = pickBenefit(product);

    const ratingData = buildStarRating(product.rating ?? product.star_rating);
    const reviewCount = formatReviewCount(product.reviews);
    const ratingRow = document.createElement("div");
    ratingRow.className = "plp-rating";

    const stars = document.createElement("div");
    stars.className = "plp-stars";
    if (ratingData) {
      stars.setAttribute(
        "aria-label",
        `${ratingData.rating.toFixed(2)} out of 5 stars`
      );
      for (let i = 0; i < ratingData.fullStars; i += 1) {
        const star = document.createElement("span");
        star.className = "plp-star filled";
        star.textContent = "★";
        stars.append(star);
      }
      if (ratingData.hasHalf) {
        const star = document.createElement("span");
        star.className = "plp-star half";
        star.textContent = "★";
        stars.append(star);
      }
      for (let i = 0; i < ratingData.emptyStars; i += 1) {
        const star = document.createElement("span");
        star.className = "plp-star empty";
        star.textContent = "★";
        stars.append(star);
      }

      const ratingValue = document.createElement("span");
      ratingValue.className = "plp-rating-value";
      ratingValue.textContent = `(${ratingData.rating.toFixed(2)})`;
      ratingRow.append(stars, ratingValue);
    } else {
      stars.setAttribute("aria-label", "No rating");
      for (let i = 0; i < 5; i += 1) {
        const star = document.createElement("span");
        star.className = "plp-star empty";
        star.textContent = "★";
        stars.append(star);
      }
      ratingRow.append(stars);
    }

    const reviewText = document.createElement("span");
    reviewText.className = "plp-review-count";
    reviewText.textContent = reviewCount
      ? `${reviewCount} Reviews`
      : "No reviews";
    ratingRow.append(reviewText);

    const priceRow = document.createElement("div");
    priceRow.className = "price-row";

    const priceGroup = document.createElement("div");
    priceGroup.className = "price-group";

    const price = document.createElement("div");
    price.className = "price";
    price.textContent = formatPrice(product.price);

    const msrp = document.createElement("div");
    msrp.className = "msrp";
    const msrpValue = getMsrpValue(product);
    msrp.textContent = msrpValue != null ? formatPrice(msrpValue) : "";

    priceGroup.append(price);
    if (msrp.textContent) {
      priceGroup.append(msrp);
    }

    const colors = document.createElement("div");
    colors.className = "color-dots";
    const availableColors = product.colors || [];
    availableColors.slice(0, 3).forEach((color) => {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = color.includes("black") ? "#222" : "#9aa3ad";
      colors.append(dot);
    });
    if (availableColors.length > 3) {
      const moreColors = document.createElement("span");
      moreColors.className = "more-colors";
      moreColors.textContent = `+${availableColors.length - 3}`;
      colors.append(moreColors);
    }

    priceRow.append(priceGroup, colors);
    body.append(name, benefit);
    if (ratingRow) {
      body.append(ratingRow);
    }
    body.append(priceRow);
    card.append(image, body);
    carouselEl.append(card);

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleProductSelection(product);
      }
    });
  });

  const itemCount = products.length;
  for (let i = 0; i < itemCount; i += 1) {
    const dot = document.createElement("span");
    dot.className = "dot-indicator";
    if (i === 0) dot.classList.add("active");
    dotsEl.append(dot);
  }

  const getCarouselItemWidth = () => {
    const firstItem = carouselEl.children[0];
    if (!firstItem) return 0;
    const gap = 12;
    return firstItem.getBoundingClientRect().width + gap;
  };

  const getCarouselIndex = () => {
    const itemWidth = getCarouselItemWidth();
    if (!itemWidth) return 0;
    return Math.max(
      0,
      Math.min(
        carouselEl.children.length - 1,
        Math.round(carouselEl.scrollLeft / itemWidth)
      )
    );
  };

  const updateDots = () => {
    const index = getCarouselIndex();
    [...dotsEl.children].forEach((dot, idx) => {
      dot.classList.toggle("active", idx === index);
    });
  };

  const updateArrows = () => {
    const maxScrollLeft = carouselEl.scrollWidth - carouselEl.clientWidth;
    const atStart = carouselEl.scrollLeft <= 1;
    const atEnd = carouselEl.scrollLeft >= maxScrollLeft - 1;
    leftArrow.disabled = atStart;
    rightArrow.disabled = atEnd;
    leftArrow.style.visibility = "visible";
    rightArrow.style.visibility = "visible";
    leftArrow.setAttribute("aria-disabled", String(atStart));
    rightArrow.setAttribute("aria-disabled", String(atEnd));
  };

  carouselEl.addEventListener("scroll", () => {
    window.requestAnimationFrame(updateDots);
    window.requestAnimationFrame(updateArrows);
  });

  carouselEl.addEventListener("click", (event) => {
    if (event.target.closest(".plp-select")) return;
    const card = event.target.closest(".product-card");
    if (!card || !carouselEl.contains(card)) return;
    const index = parseInt(card.dataset.productIndex || "0", 10);
    const product = products[index];
    handleProductSelection(product);
  });

  const scrollToCarouselIndex = (targetIndex) => {
    const itemWidth = getCarouselItemWidth();
    if (!itemWidth) return;
    const clampedIndex = Math.max(
      0,
      Math.min(carouselEl.children.length - 1, targetIndex)
    );
    carouselEl.scrollTo({
      left: clampedIndex * itemWidth,
      behavior: "smooth",
    });
  };

  leftArrow.addEventListener("click", () => {
    scrollToCarouselIndex(getCarouselIndex() - 1);
  });

  rightArrow.addEventListener("click", () => {
    scrollToCarouselIndex(getCarouselIndex() + 1);
  });

  window.requestAnimationFrame(updateArrows);
  carouselShell.append(leftArrow, carouselEl, rightArrow);
  wrapper.append(carouselShell, dotsEl);
  return wrapper;
}

function buildPdpDescription(product) {
  if (product.description) {
    return product.description;
  }
  const parts = [
    ...(product.features || []).slice(0, 2),
    ...(product.materials || []).slice(0, 2),
  ].filter(Boolean);
  if (parts.length === 0) {
    return "A daily essential with skin-loving ingredients and a lightweight feel.";
  }
  return `Formulated with ${parts.join(" and ")} for visible results and everyday wear.`;
}

function extractCapacity(product) {
  if (typeof product.capacity_l === "number") return product.capacity_l;
  const sizes = product.sizes || [];
  for (const size of sizes) {
    const match = String(size).match(/(\d+)\s*L/i);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function isSkincareProduct(product) {
  const category = (product.category || "").toLowerCase();
  const type = (product.product_type || "").toLowerCase();
  return /skincare|skin care|serum|moisturizer|cleanser|toner|mask|sunscreen/.test(
    `${category} ${type}`
  );
}

function isMakeupProduct(product) {
  const category = (product.category || "").toLowerCase();
  const type = (product.product_type || "").toLowerCase();
  return /makeup|cosmetics|foundation|concealer|lip|mascara|blush|powder|primer/.test(
    `${category} ${type}`
  );
}

function isHaircareProduct(product) {
  const category = (product.category || "").toLowerCase();
  const type = (product.product_type || "").toLowerCase();
  return /hair|haircare|shampoo|conditioner|mask|oil|styling/.test(
    `${category} ${type}`
  );
}

function isFragranceProduct(product) {
  const category = (product.category || "").toLowerCase();
  const type = (product.product_type || "").toLowerCase();
  return /fragrance|perfume|cologne|mist/.test(`${category} ${type}`);
}

function isToolProduct(product) {
  const category = (product.category || "").toLowerCase();
  const type = (product.product_type || "").toLowerCase();
  return /tool|brush|sponge|roller|device/.test(`${category} ${type}`);
}

function buildPdpFaqActions(product) {
  const ingredientAction = { key: "ingredients", label: "What are the ingredients?" };
  if (isSkincareProduct(product)) {
    return [
      { key: "cancellation-policy", label: "What is the cancellation policy?" },
      { key: "fragrance-free", label: "Is this fragrance-free?" },
      ingredientAction,
    ];
  }

  if (isMakeupProduct(product)) {
    return [
      { key: "cancellation-policy", label: "What is the cancellation policy?" },
      { key: "long-wear", label: "Is it long-wearing?" },
      ingredientAction,
    ];
  }

  if (isHaircareProduct(product)) {
    return [
      { key: "cancellation-policy", label: "What is the cancellation policy?" },
      { key: "color-safe", label: "Is it color-safe?" },
      ingredientAction,
    ];
  }

  if (isFragranceProduct(product)) {
    return [
      { key: "cancellation-policy", label: "What is the cancellation policy?" },
      { key: "scent-profile", label: "What is the scent profile?" },
      ingredientAction,
    ];
  }

  if (isToolProduct(product)) {
    return [
      { key: "cancellation-policy", label: "What is the cancellation policy?" },
      { key: "how-to-use", label: "How do I use this?" },
      ingredientAction,
    ];
  }

  return [
    { key: "cancellation-policy", label: "What is the cancellation policy?" },
    { key: "formulation", label: "What is the formula like?" },
    ingredientAction,
  ];
}

function extractIngredientsFromComposition(composition) {
  if (!composition) return [];
  const text = String(composition).replace(/\u00a0/g, " ");
  const markerIndex = text.toLowerCase().indexOf("ingredients:");
  const source = markerIndex >= 0 ? text.slice(markerIndex + "ingredients:".length) : text;
  return source
    .split(/[\n,;•·･・]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function summarizeIngredients(product) {
  const list = Array.isArray(product.ingredients) && product.ingredients.length
    ? product.ingredients
    : extractIngredientsFromComposition(product.composition);
  const normalized = list.map((item) => String(item).trim()).filter(Boolean);
  if (!normalized.length) {
    return "I don't have the ingredient list for this item yet.";
  }
  const top = normalized.slice(0, 6);
  const suffix = normalized.length > top.length ? " and more." : ".";
  return `Key ingredients include ${top.join(", ")}${suffix}`;
}

function extractCapacityFromDescription(description) {
  if (!description) return null;
  const match = String(description).match(/(\d+)\s*L/i);
  if (!match) return null;
  return parseInt(match[1], 10);
}

function normalizeWaterproofRating(rating) {
  if (!rating) return null;
  const normalized = String(rating).trim().toLowerCase();
  const match = normalized.match(/(\d+)\s*k/);
  if (match) {
    return `${match[1]}k`;
  }
  return normalized;
}

function hasDiscoveryIntentFilters(intent = {}) {
  return Object.values(intent).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value != null && value !== "";
  });
}

function answerPdpFaq(product, key) {
  const description = product.description || buildPdpDescription(product);
  switch (key) {
    case "cancellation-policy": {
      return "We offer a 30 day no questions asked return policy. Try it out. and easily return if you don't like it";
    }
    case "fragrance-free": {
      if (product.fragrance_free) {
        return "Yes — this formula is fragrance-free.";
      }
      return "It contains a light fragrance. If you prefer fragrance-free options, I can recommend alternatives.";
    }
    case "long-wear": {
      if (product.long_wear) {
        return "Yes — it's designed for long wear with minimal touch-ups.";
      }
      return "It wears comfortably, and pairing with a primer can extend wear time.";
    }
    case "color-safe": {
      if (product.color_safe) {
        return "Yes — it's safe for color-treated hair.";
      }
      return "It is gentle, but I can suggest a color-safe option if needed.";
    }
    case "scent-profile": {
      return product.scent_profile
        ? `This one is ${product.scent_profile}.`
        : "It has a balanced, everyday-friendly scent profile.";
    }
    case "how-to-use": {
      return product.how_to_use
        ? product.how_to_use
        : "Apply to clean skin or hair as directed, and adjust based on your routine.";
    }
    case "formulation": {
      const texture = product.texture || "lightweight";
      return `The formula feels ${texture} and layers well with other products.`;
    }
    case "ingredients": {
      return summarizeIngredients(product);
    }
    default:
      return "Let me know what you'd like to know about this item.";
  }
}

function buildPdpActions(product) {
  const actions = [
    ...buildPdpFaqActions(product),
    { key: "upsell", label: "Show skincare bestsellers", type: "search" },
    { key: "cross-sell", label: "Find a matching cleanser", type: "search" },
  ];

  return actions.slice(0, 5);
}

function buildPdpFollowupActions(product, excludeKey) {
  const faqActions = buildPdpFaqActions(product).filter(
    (action) => action.key !== excludeKey
  );
  return [
    ...faqActions.map((action) => ({ ...action, type: "faq" })),
    { key: "upsell", label: "Show skincare bestsellers", type: "search" },
    { key: "cross-sell", label: "Find a matching cleanser", type: "search" },
  ];
}

function createFaqAnswerBubble(product, actionKey) {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant faq-answer-bubble";

  const answer = document.createElement("div");
  answer.className = "faq-answer";
  answer.textContent = answerPdpFaq(product, actionKey);
  bubble.append(answer);
  return bubble;
}

function createPdpFollowupChipsRow(product, excludeKey) {
  const row = document.createElement("div");
  row.className = "pdp-followup-chips-row";
  const actions = buildPdpFollowupActions(product, excludeKey);
  row.innerHTML = actions
    .map((action) => {
      const type = action.type || "faq";
      return `<button class="chip" data-action-type="${type}" data-action-key="${action.key}">
        ${action.label}
      </button>`;
    })
    .join("");

  hideNbaPillSets(row);
  row.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const label = button.textContent.trim();
    const actionType = button.dataset.actionType || "faq";
    const actionKey = button.dataset.actionKey || "";
    hideNbaPillSet(row);
    handlePdpAction(product, actionType, actionKey, label);
  });

  return row;
}

function handlePdpAction(product, actionType, actionKey, label) {
  addBubble("user", label);

  if (actionType === "search") {
    runSearch(label, null, false, lastIntentFilters);
    return;
  }

  if (actionKey === "cancellation-policy") {
    runWithLatency(
      () => {
        addReturnPolicyAnswer();
        updateScrollButton();
      },
      LATENCY_MS,
      "Looking up return policy..."
    );
    return;
  }

  runWithLatency(
    () => {
      chatEl.append(createFaqAnswerBubble(product, actionKey));
      chatEl.append(createPdpFollowupChipsRow(product, actionKey));
      updateScrollButton();
    },
    LATENCY_MS,
    "Looking that up..."
  );
}

function formatColorLabel(colors) {
  if (!colors || colors.length === 0) return "Select a shade";
  const label = colors
    .slice(0, 2)
    .map((color) =>
      color
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    )
    .join(" and ");
  return label;
}

function createPdpBubble(product) {
  const bubble = document.createElement("div");
  bubble.className = "bubble assistant pdp-bubble";

  const card = document.createElement("div");
  card.className = "pdp-card";

  const carousel = document.createElement("div");
  carousel.className = "pdp-carousel";

  const imageFrame = document.createElement("div");
  imageFrame.className = "pdp-carousel-frame";

  const image = document.createElement("img");
  const fallbackImage = getFallbackImageUrl(product.name, 3);
  const images = getProductCarouselImages(product, fallbackImage);
  let currentIndex = 0;
  const resolveImageSrc = (path) =>
    path.startsWith("data:") ? path : new URL(path, window.location.href).href;
  image.src = resolveImageSrc(images[currentIndex]);
  image.alt = product.name;
  image.loading = "lazy";
  imageFrame.append(image);

  const leftArrow = document.createElement("button");
  leftArrow.className = "pdp-arrow left";
  leftArrow.setAttribute("aria-label", "Previous image");
  leftArrow.textContent = "‹";

  const rightArrow = document.createElement("button");
  rightArrow.className = "pdp-arrow right";
  rightArrow.setAttribute("aria-label", "Next image");
  rightArrow.textContent = "›";

  const dots = document.createElement("div");
  dots.className = "pdp-carousel-dots";
  images.forEach((_, idx) => {
    const dot = document.createElement("span");
    dot.className = "pdp-dot";
    if (idx === currentIndex) dot.classList.add("active");
    dots.append(dot);
  });

  const updateCarousel = () => {
    image.src = resolveImageSrc(images[currentIndex]);
    [...dots.children].forEach((dot, idx) => {
      dot.classList.toggle("active", idx === currentIndex);
    });
  };

  leftArrow.addEventListener("click", () => {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    updateCarousel();
  });

  rightArrow.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % images.length;
    updateCarousel();
  });

  carousel.append(leftArrow, imageFrame, rightArrow, dots);

  const body = document.createElement("div");
  body.className = "pdp-body";

  const title = document.createElement("div");
  title.className = "pdp-title";
  title.textContent = product.name;

  const priceRow = document.createElement("div");
  priceRow.className = "pdp-price-row";

  const price = document.createElement("span");
  price.className = "pdp-price";
  const msrp = document.createElement("span");
  msrp.className = "pdp-msrp";

  const variantOptions = Array.isArray(product.variants)
    ? product.variants.filter((variant) => variant && (variant.size || variant.price != null))
    : [];
  const variantBySize = new Map();
  variantOptions.forEach((variant) => {
    const sizeLabel = (variant.size || "Standard").trim() || "Standard";
    if (!variantBySize.has(sizeLabel)) {
      variantBySize.set(sizeLabel, variant);
    }
  });
  const hasVariants = variantBySize.size > 0;

  const getVariantPricing = (variant) => {
    if (!variant) return { current: null, msrp: null };
    const current =
      Number.isFinite(variant.price)
        ? variant.price
        : Number.isFinite(variant.sale_price)
          ? variant.sale_price
          : Number.isFinite(variant.standard_price)
            ? variant.standard_price
            : null;
    const standard = Number.isFinite(variant.standard_price)
      ? variant.standard_price
      : null;
    const showMsrp = current != null && standard != null && current < standard;
    return { current, msrp: showMsrp ? standard : null };
  };

  const applyPricing = (current, msrpValue) => {
    const safeCurrent = Number.isFinite(current) ? current : 0;
    price.textContent = formatPrice(safeCurrent);
    if (Number.isFinite(msrpValue)) {
      msrp.textContent = formatPrice(msrpValue);
      msrp.style.display = "inline";
    } else {
      msrp.textContent = "";
      msrp.style.display = "none";
    }
  };

  if (hasVariants) {
    const firstVariant = variantBySize.values().next().value;
    const pricing = getVariantPricing(firstVariant);
    applyPricing(pricing.current ?? product.price ?? 0, pricing.msrp);
  } else {
    const fallbackMsrp =
      product.msrp != null ? product.msrp : Math.round((product.price || 0) * 1.2);
    const showMsrp = Boolean(product.msrp || product.price);
    applyPricing(product.price || 0, showMsrp ? fallbackMsrp : null);
  }

  priceRow.append(price, msrp);

  const description = document.createElement("div");
  description.className = "pdp-description";
  description.textContent = buildPdpDescription(product);

  const sizeOptions = hasVariants
    ? Array.from(variantBySize.keys())
    : product.sizes && product.sizes.length > 0
      ? product.sizes
      : product.size_ml
        ? [`${product.size_ml} ml`]
        : ["Standard"];
  const sizeFieldValue = sizeOptions[0] || "Standard";

  const sizeField = document.createElement("div");
  sizeField.className = "pdp-field";
  const sizeLabel = document.createElement("span");
  sizeLabel.className = "pdp-field-label";
  sizeLabel.textContent = "Size";
  const sizeValue = document.createElement("span");
  sizeValue.className = "pdp-field-value";
  const sizeValueText = document.createElement("span");
  sizeValueText.className = "pdp-field-value-text";
  sizeValueText.textContent = sizeFieldValue;
  const sizeMeta = document.createElement("span");
  sizeMeta.className = "pdp-field-meta";
  sizeMeta.textContent = "(Recommended)";
  sizeValue.append(sizeValueText, " ", sizeMeta);
  sizeField.append(sizeLabel, sizeValue);

  const sizeGrid = document.createElement("div");
  sizeGrid.className = "pdp-size-grid";
  sizeOptions.slice(0, 6).forEach((size, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pdp-chip";
    btn.textContent = size;
    if (index === 0) btn.classList.add("selected");
    sizeGrid.append(btn);
  });

  sizeGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".pdp-chip");
    if (!button) return;
    sizeGrid.querySelectorAll(".pdp-chip").forEach((btn) => {
      btn.classList.remove("selected");
    });
    button.classList.add("selected");
    sizeValueText.textContent = button.textContent.trim();
    if (hasVariants) {
      const selectedVariant = variantBySize.get(button.textContent.trim());
      const pricing = getVariantPricing(selectedVariant);
      applyPricing(pricing.current ?? product.price ?? 0, pricing.msrp);
    }
  });

  const colorField = document.createElement("div");
  const colorDots = document.createElement("div");
  let finishField;
  let finishGrid;
  let skinField;
  let skinGrid;
  if (!hasVariants) {
    colorField.className = "pdp-field";
    colorField.innerHTML = `
      <span class="pdp-field-label">Shade</span>
      <span class="pdp-field-value">${formatColorLabel(product.colors)}</span>
    `;

    colorDots.className = "pdp-color-dots";
    (product.colors || ["#e5e5e5", "#a67c52", "#2f2f2f", "#c2c2c2"])
      .slice(0, 5)
      .forEach((color, index) => {
        const safeColor = String(color || "");
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "pdp-color-dot";
        dot.dataset.color = safeColor;
        dot.style.background =
          safeColor.startsWith("#") || safeColor.includes("rgb")
            ? safeColor
            : safeColor.includes("black")
              ? "#1f1f1f"
              : safeColor.includes("navy")
                ? "#0b1f3a"
                : safeColor.includes("brown")
                  ? "#7a4b21"
                  : "#c8c8c8";
        if (index === 0) dot.classList.add("active");
        colorDots.append(dot);
      });

    colorDots.addEventListener("click", (event) => {
      const dot = event.target.closest(".pdp-color-dot");
      if (!dot) return;
      colorDots.querySelectorAll(".pdp-color-dot").forEach((btn) => {
        btn.classList.remove("active");
      });
      dot.classList.add("active");
    });

    finishField = document.createElement("div");
    finishField.className = "pdp-field";
    const finishValue = product.finish || "Natural";
    finishField.innerHTML = `
      <span class="pdp-field-label">Finish</span>
      <span class="pdp-field-value">
        ${finishValue}
        <span class="pdp-field-meta">(Recommended)</span>
      </span>
    `;

    finishGrid = document.createElement("div");
    finishGrid.className = "pdp-fit-grid";
    const finishes = [finishValue, "Matte", "Dewy", "Radiant"].filter(
      (value, index, list) => list.indexOf(value) === index
    );
    finishes.slice(0, 3).forEach((finish, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pdp-chip";
      btn.textContent = finish;
      if (index === 0) btn.classList.add("selected");
      finishGrid.append(btn);
    });

    finishGrid.addEventListener("click", (event) => {
      const button = event.target.closest(".pdp-chip");
      if (!button) return;
      finishGrid.querySelectorAll(".pdp-chip").forEach((btn) => {
        btn.classList.remove("selected");
      });
      button.classList.add("selected");
    });

    skinField = document.createElement("div");
    skinField.className = "pdp-field";
    const skinValue = product.skin_type || "All skin types";
    skinField.innerHTML = `
      <span class="pdp-field-label">Skin type</span>
      <span class="pdp-field-value">${skinValue}</span>
    `;

    skinGrid = document.createElement("div");
    skinGrid.classList.add("pdp-fit-grid");
    const skinOptions = [
      skinValue,
      "Dry",
      "Oily",
      "Combination",
      "Sensitive",
    ].filter((value, index, list) => list.indexOf(value) === index);
    skinOptions.slice(0, 3).forEach((skin, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pdp-chip";
      btn.textContent = skin;
      if (index === 0) btn.classList.add("selected");
      skinGrid.append(btn);
    });

    skinGrid.addEventListener("click", (event) => {
      const button = event.target.closest(".pdp-chip");
      if (!button) return;
      skinGrid.querySelectorAll(".pdp-chip").forEach((btn) => {
        btn.classList.remove("selected");
      });
      button.classList.add("selected");
    });
  }

  const qtyField = document.createElement("div");
  qtyField.className = "pdp-field";
  qtyField.innerHTML = `
    <span class="pdp-field-label">Qty</span>
    <span class="pdp-field-value">1</span>
  `;

  const qtyControls = document.createElement("div");
  qtyControls.className = "pdp-qty";
  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "pdp-qty-btn";
  minus.textContent = "−";
  const qtyValue = document.createElement("div");
  qtyValue.className = "pdp-qty-value";
  qtyValue.textContent = "1";
  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "pdp-qty-btn";
  plus.textContent = "+";
  qtyControls.append(minus, qtyValue, plus);

  const updateQty = (delta) => {
    const next = Math.max(1, parseInt(qtyValue.textContent, 10) + delta);
    qtyValue.textContent = String(next);
    qtyField.querySelector(".pdp-field-value").textContent = String(next);
  };

  minus.addEventListener("click", () => updateQty(-1));
  plus.addEventListener("click", () => updateQty(1));

  const applePay = document.createElement("button");
  applePay.type = "button";
  applePay.className = "pdp-apple-pay";
  applePay.innerHTML = `<span class="apple-logo"></span> Pay`;

  const addToCart = document.createElement("button");
  addToCart.type = "button";
  addToCart.className = "pdp-add-to-cart";
  addToCart.textContent = "Add to Cart";

  body.append(title, priceRow, description);
  if (!hasVariants) {
    body.append(colorField, colorDots);
  }
  body.append(sizeField, sizeGrid);
  if (!hasVariants && finishField && finishGrid && skinField && skinGrid) {
    body.append(finishField, finishGrid, skinField, skinGrid);
  }
  body.append(qtyField, qtyControls, applePay, addToCart);

  card.append(carousel, body);
  bubble.append(card);

  const actionChips = document.createElement("div");
  actionChips.className = "pdp-action-chips";
  const actions = buildPdpActions(product);
  actionChips.innerHTML = actions
    .map((action) => {
      const type = action.type || "faq";
      return `<button class="chip" data-action-type="${type}" data-action-key="${action.key}">
        ${action.label}
      </button>`;
    })
    .join("");
  hideNbaPillSets(actionChips);
  actionChips.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const label = button.textContent.trim();
    const actionType = button.dataset.actionType || "faq";
    const actionKey = button.dataset.actionKey || "";
    hideNbaPillSet(actionChips);
    handlePdpAction(product, actionType, actionKey, label);
  });
  bubble.append(actionChips);

  applePay.addEventListener("click", () => {
    const qty = parseInt(qtyValue.textContent, 10) || 1;
    const selectedColor = hasVariants
      ? null
      : colorDots.querySelector(".pdp-color-dot.active")?.dataset.color ||
        product.colors?.[0] ||
        "neutral";
    const selectedSize =
      sizeGrid.querySelector(".pdp-chip.selected")?.textContent.trim() ||
      product.sizes?.[0] ||
      "One size";
    const selectedFinish = finishGrid
      ? finishGrid.querySelector(".pdp-chip.selected")?.textContent.trim() || null
      : null;
    const selectedVariant = hasVariants
      ? variantBySize.get(selectedSize || "Standard")
      : null;
    const variantPricing = getVariantPricing(selectedVariant);
    const productForCart =
      hasVariants && Number.isFinite(variantPricing.current)
        ? { ...product, price: variantPricing.current, msrp: variantPricing.msrp ?? product.msrp }
        : product;
    const item = buildCartItem(productForCart, {
      qty,
      color: selectedColor,
      size: selectedSize,
      fit: selectedFinish,
    });
    startApplePayFlow({
      items: [item],
      appliedItemCoupons: {},
      appliedCartCoupons: [],
    });
  });

  addToCart.addEventListener("click", () => {
    addBubble("user", `Add to cart ${product.name}`);
    hideNbaPillSets();
    runWithLatency(() => {
      const qty = parseInt(qtyValue.textContent, 10) || 1;
      const selectedColor = hasVariants
        ? null
        : colorDots.querySelector(".pdp-color-dot.active")?.dataset.color ||
          product.colors?.[0] ||
          "neutral";
      const selectedSize =
        sizeGrid.querySelector(".pdp-chip.selected")?.textContent.trim() ||
        product.sizes?.[0] ||
        "One size";
      const selectedFinish = finishGrid
        ? finishGrid.querySelector(".pdp-chip.selected")?.textContent.trim() || null
        : null;
      const selectedVariant = hasVariants
        ? variantBySize.get(selectedSize || "Standard")
        : null;
      const variantPricing = getVariantPricing(selectedVariant);
      const productForCart =
        hasVariants && Number.isFinite(variantPricing.current)
          ? { ...product, price: variantPricing.current, msrp: variantPricing.msrp ?? product.msrp }
          : product;
      const newItem = buildCartItem(productForCart, {
        qty,
        color: selectedColor,
        size: selectedSize,
        fit: selectedFinish,
      });

      if (cartState.items.length === 0) {
        cartState.items = [newItem];
      } else {
        const existing = cartState.items.find(
          (item) =>
            item.id === newItem.id &&
            item.size === newItem.size &&
            item.color === newItem.color
        );
        if (existing) {
          existing.qty += newItem.qty;
        } else {
          cartState.items.push(newItem);
        }
      }

      const cartBubble = createCartBubble(cartState, newItem);
      chatEl.append(cartBubble);
      scrollChatElementIntoView(cartBubble);
      updateScrollButton();
    }, 2000, "Adding to cart...");
  });
  return bubble;
}

function setupPdpSticky(bubble) {
  const card = bubble.querySelector(".pdp-card");
  if (!card) return;

  const updateSticky = () => {
    const isTall = card.getBoundingClientRect().height > window.innerHeight;
    card.classList.toggle("pdp-card--sticky", isTall);
  };

  const scheduleUpdate = () => window.requestAnimationFrame(updateSticky);
  scheduleUpdate();
  window.addEventListener("resize", scheduleUpdate);

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(card);
  }
}

function createShowMoreTile(onClick) {
  const card = document.createElement("div");
  card.className = "card show-more-card";
  card.innerHTML = `
    <div class="show-more-plus">+</div>
    <div class="show-more-text">Show more</div>
  `;
  card.addEventListener("click", onClick);
  return card;
}

function renderCarouselPage(results, message, startIndex = 0) {
  const pageItems = results.slice(startIndex, startIndex + 5);
  const hasMore = results.length > startIndex + 5;

  const carouselBubble = createCarouselBubble(pageItems, message);
  const carouselEl = carouselBubble.querySelector(".carousel");

  if (hasMore) {
    const showMoreTile = createShowMoreTile(() => {
      addBubble("user", "Show more");
      runWithLatency(() => {
        chatEl.append(renderCarouselPage(results, null, startIndex + 5));
        scrollChatElementIntoView(chatEl.lastElementChild);
        updateScrollButton();
      }, LATENCY_MS, "Loading more...");
    });
    carouselEl.append(showMoreTile);
    const dot = document.createElement("span");
    dot.className = "dot-indicator";
    carouselBubble.querySelector(".carousel-dots").append(dot);
  }

  return carouselBubble;
}

function addGenderChips() {
  const existing = chatEl.querySelector(".chips");
  if (existing) existing.remove();

  const chipRow = document.createElement("div");
  chipRow.className = "chips gender-chips";
  chipRow.innerHTML = `
    <button class="chip" data-gender="Men">Male</button>
    <button class="chip" data-gender="Women">Female</button>
    <button class="chip" data-gender="Unisex">Unisex</button>
    <button class="chip" data-gender="">Skip</button>
  `;
  hideNbaPillSets(chipRow);
  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const gender = button.dataset.gender || "";
    const label = button.textContent.trim();
    addBubble("user", label);
    hideNbaPillSet(chipRow);
    selectedGenderLabel =
      label.toLowerCase() === "skip" ? "No preference" : label;
    activeGender = gender || null;
    pendingDurationQuery = pendingGenderQuery || lastQuery;
    pendingDurationFilters = pendingIntentFilters || lastIntentFilters;
    pendingGenderQuery = null;
    pendingIntentFilters = null;

    const acknowledgement =
      label.toLowerCase() === "skip" ? "No problem." : `Got it—${label}.`;
    runWithLatency(() => {
      addBubble(
        "assistant",
        `${acknowledgement} What is the usual duration you hike for?`
      );
      addDurationChips();
    });
  });
  chatEl.append(chipRow);
}

function addDurationChips() {
  const existing = chatEl.querySelector(".chips");
  if (existing) existing.remove();

  const chipRow = document.createElement("div");
  chipRow.className = "chips";
  chipRow.innerHTML = `
    <button class="chip" data-duration="1">Single day</button>
    <button class="chip" data-duration="2">2 days</button>
    <button class="chip" data-duration="7">One week</button>
    <button class="chip" data-duration="14">2 week</button>
    <button class="chip" data-duration="">Not sure</button>
  `;
  hideNbaPillSets(chipRow);
  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const label = button.textContent.trim();
    addBubble("user", label);
    hideNbaPillSet(chipRow);
    selectedClimateLabel = label;
    selectedDurationLabel = label;

    pendingClimateQuery = pendingDurationQuery || lastQuery;
    pendingClimateFilters = pendingDurationFilters || lastIntentFilters;
    pendingDurationQuery = null;
    pendingDurationFilters = null;

    runWithLatency(() => {
      addBubble(
        "assistant",
        `Awesome—${label} sounds fun! Do you generally hike in warm climate, cold climate, rainy, or mix of all?`
      );
      addClimateChips();
    });
  });
  chatEl.append(chipRow);
}

function addClimateChips() {
  const existing = chatEl.querySelector(".chips");
  if (existing) existing.remove();

  const chipRow = document.createElement("div");
  chipRow.className = "chips";
  chipRow.innerHTML = `
    <button class="chip">Warm climate</button>
    <button class="chip">Cold climate</button>
    <button class="chip">Rainy</button>
    <button class="chip">Mix of all</button>
  `;
  hideNbaPillSets(chipRow);
  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const label = button.textContent.trim();
    addBubble("user", label);
    hideNbaPillSet(chipRow);

    pendingSupportQuery = pendingClimateQuery || lastQuery;
    pendingSupportFilters = pendingClimateFilters || lastIntentFilters;
    pendingClimateQuery = null;
    pendingClimateFilters = null;

    runWithLatency(() => {
      addBubble(
        "assistant",
        `Love it! Sure. One last question. How do you prefer your backpack support?`
      );
      addSupportChips();
    });
  });
  chatEl.append(chipRow);
}

function addSupportChips() {
  const existing = chatEl.querySelector(".chips");
  if (existing) existing.remove();

  const chipRow = document.createElement("div");
  chipRow.className = "chips";
  chipRow.innerHTML = `
    <button class="chip">Full aluminium frame</button>
    <button class="chip">Semi plastic framed</button>
    <button class="chip">Titanium mesh</button>
    <button class="chip">Air pockets</button>
    <button class="chip" data-support-more="1">Show more</button>
  `;
  hideNbaPillSets(chipRow);
  chipRow.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    if (button.dataset.supportMore === "1") {
      runWithLatency(() => {
        addSupportMoreChips(chipRow);
      });
      return;
    }

    const label = button.textContent.trim();
    addBubble("user", label);
    hideNbaPillSet(chipRow);
    selectedSupportLabel = label;

    const query = pendingSupportQuery || lastQuery;
    const filters = pendingSupportFilters || lastIntentFilters;
    pendingSupportQuery = null;
    pendingSupportFilters = null;

    showFinalRecommendations(query, filters);
  });
  chatEl.append(chipRow);
}

function addSupportMoreChips(container) {
  const alreadyAdded = container.querySelector(".support-more-added");
  if (alreadyAdded) return;

  const showMoreButton = container.querySelector(
    '.chip[data-support-more="1"]'
  );
  if (showMoreButton) showMoreButton.remove();

  const moreWrapper = document.createElement("div");
  moreWrapper.className = "support-more-added";
  moreWrapper.innerHTML = `
    <button class="chip">Acrylic full frame</button>
    <button class="chip">Aircraft grade mesh frame</button>
    <button class="chip">Back support lite frame</button>
    <button class="chip">Composite membrane frame</button>
    <button class="chip">Show more</button>
  `;
  moreWrapper.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    const label = button.textContent.trim();
    if (label === "Show more") return;
    addBubble("user", label);
    hideNbaPillSet(container);
    selectedSupportLabel = label;

    const query = pendingSupportQuery || lastQuery;
    const filters = pendingSupportFilters || lastIntentFilters;
    pendingSupportQuery = null;
    pendingSupportFilters = null;

    showFinalRecommendations(query, filters);
  });
  container.append(moreWrapper);
}
function runSearch(query, filterLabel, includeUserBubble, intentFilters) {
  if (!query) return;
  lastQuery = query;
  lastIntentFilters = intentFilters || lastIntentFilters;
  if (intentFilters?.discoveryIntent) {
    lastDiscoveryIntent = {
      ...(lastDiscoveryIntent || {}),
      ...intentFilters.discoveryIntent,
      product_category:
        intentFilters.discoveryIntent.product_category ??
        lastDiscoveryIntent?.product_category,
    };
  } else {
    lastDiscoveryIntent = lastDiscoveryIntent || null;
  }

  selectedPlpProducts.clear();

  if (includeUserBubble) {
    addBubble("user", query);
  }

  const loadingBubble = addLoadingBubble();

  let results = [];
  let reply = null;
  results = allProducts.filter((p) => matchesQuery(p, query));
  results = applyIntentFilters(results, intentFilters || lastIntentFilters);
  results = applyFilter(results);
  results = results.slice(0, 10);

  setTimeout(() => {
    loadingBubble.remove();
    reply = assistantCopy(query, results.length);
    const carouselBubble = renderCarouselPage(results, reply, 0);
    chatEl.append(carouselBubble);
    renderNextBestActions();
    scrollChatElementIntoView(carouselBubble);
    updateScrollButton();
  }, LATENCY_MS);
}

function isReturnPolicyQuery(query) {
  const n = (query || "").toLowerCase().trim();
  return (
    /return\s*policy|what(\s+is)?\s+the\s+return\s*policy|returns?\s*policy|shiseido\s+return/.test(
      n
    ) || n === "return policy" || n === "returns"
  );
}

function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) return;
  if (isReturnPolicyQuery(query)) {
    addBubble("user", query);
    searchInput.value = "";
    runWithLatency(
      () => addReturnPolicyAnswer(),
      LATENCY_MS,
      "Looking up return policy..."
    );
    return;
  }
  const intent = parseIntent(query);
  const hasFilters = hasDiscoveryIntentFilters(intent.discoveryIntent);
  if (!hasFilters) {
    lastIntentFilters = null;
    lastDiscoveryIntent = null;
  }
  runSearch(
    intent.queryText || query,
    null,
    true,
    hasFilters ? { discoveryIntent: intent.discoveryIntent } : null
  );
  searchInput.value = "";
}

function setupEvents() {
  chatEl.addEventListener("click", (event) => {
    const button = event.target.closest("button, [role='button']");
    if (button) triggerHaptic();
  });
  searchButton.addEventListener("click", handleSearch);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleSearch();
  });

  chatEl.addEventListener("scroll", updateScrollButton);
  window.addEventListener("scroll", updateScrollButton);
  window.addEventListener("resize", updateScrollButton);
  scrollToBottomBtn.addEventListener("click", () => {
    const metrics = getScrollMetrics();
    metrics.scrollToBottom();
  });

  const observer = new MutationObserver((mutations) => {
    let shouldScroll = false;
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node;
        const assistantNode = element.matches?.(".assistant")
          ? element
          : element.querySelector?.(".assistant");
        if (assistantNode) shouldScroll = true;
      });
    });

    if (!shouldScroll) return;
    const target = chatEl.lastElementChild;
    if (target) scrollChatElementIntoView(target);
  });

  observer.observe(chatEl, { childList: true });
}

fetch(catalogPath)
  .then((response) => {
    if (!response.ok) throw new Error("Catalog not found");
    return response.json();
  })
  .then((catalog) => {
    allProducts = (catalog.products || []).map((product) => {
      const normalizedRating =
        product.rating ?? product.star_rating ?? null;
      const normalizedReviews =
        product.reviews ?? product.review_count ?? product.reviewCount ?? null;
      return {
        ...product,
        rating: normalizedRating,
        reviews: normalizedReviews,
        compare_attributes: buildMockCompareAttributes(product),
      };
    });
    allProducts = shuffle(allProducts);
    setupEvents();
    addIntroSection();
    updateScrollButton();
  })
  .catch(() => {
    addBubble(
      "assistant",
      "Could not load the catalog. Open this page via http://localhost:8080 (run: python3 -m http.server 8080 in the project folder)."
    );
  });
