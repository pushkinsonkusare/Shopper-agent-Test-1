import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "Skincare _ SHISEIDO.csv"
IMAGES_ROOT = ROOT / "Skincare _ SHISEIDO_Images"
OUTPUT_PATH = ROOT / "shiseido-catalog.json"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def normalize_block(value: str) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_inline(value: str) -> str:
    return re.sub(r"\s+", " ", normalize_block(value)).strip()


def parse_price(value: str):
    if not value:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)", value.replace(",", ""))
    return float(match.group(1)) if match else None


def parse_rating(value: str):
    if value is None:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)", str(value))
    return float(match.group(1)) if match else None


def parse_review_count(value: str):
    if value is None:
        return None
    match = re.search(r"(\d[\d,]*)", str(value))
    if not match:
        return None
    return int(match.group(1).replace(",", ""))


def parse_variants(value: str):
    if not value:
        return []
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def extract_lines(block: str):
    if not block:
        return []
    lines = []
    for line in block.split("\n"):
        clean = re.sub(r"^[\-\u2022•\t ]+", "", line).strip()
        if not clean:
            continue
        lines.append(clean)
    return lines


def extract_ingredients(block: str):
    if not block:
        return []
    match = re.search(r"ingredients?:\s*(.+)", block, re.IGNORECASE)
    if not match:
        return []
    ingredients_text = match.group(1)
    ingredients_text = ingredients_text.replace("\uff65", ",").replace("・", ",").replace("･", ",")
    ingredients_text = re.sub(r"\s+", " ", ingredients_text).strip()
    parts = [part.strip(" .;") for part in re.split(r",|\n|;", ingredients_text)]
    return [part for part in parts if part][:20]


def extract_features(description: str, composition: str):
    sentences = re.split(r"[.!?]\s+", normalize_inline(description))
    features = [sentence.strip() for sentence in sentences if sentence.strip()]
    if not features:
        features = extract_lines(composition)
    return features[:3]


def infer_product_type(name: str):
    if not name:
        return "skincare"
    lowered = name.lower()
    keywords = [
        ("sunscreen", "sunscreen"),
        ("spf", "sunscreen"),
        ("serum", "serum"),
        ("cleanser", "cleanser"),
        ("lotion", "lotion"),
        ("moisturizer", "moisturizer"),
        ("cream", "moisturizer"),
        ("mask", "mask"),
        ("eye", "eye care"),
        ("toner", "toner"),
        ("essence", "essence"),
        ("oil", "oil"),
        ("set", "gift set"),
        ("kit", "gift set"),
    ]
    for keyword, label in keywords:
        if keyword in lowered:
            return label
    return "skincare"


def normalize_category(value: str, product_type: str):
    if not value:
        return f"Skincare/{product_type.title()}"
    cleaned = normalize_inline(value)
    lowered = cleaned.lower()
    if "rating" in lowered or re.search(r"\d", cleaned):
        return f"Skincare/{product_type.title()}"
    if "/" in cleaned:
        return cleaned
    return f"Skincare/{cleaned}"


def infer_benefits(text: str):
    lowered = text.lower()
    benefit_map = [
        ("hydration", ["hydration", "hydrate", "moisture"]),
        ("brightening", ["brighten", "radiance", "glow"]),
        ("firming", ["firm", "lifting", "elasticity"]),
        ("soothing", ["soothe", "calm", "sensitive"]),
        ("smoothing", ["smooth", "refine", "texture"]),
        ("repair", ["repair", "revital", "renew"]),
        ("sun protection", ["spf", "sun protection", "uv"]),
    ]
    benefits = []
    for label, tokens in benefit_map:
        if any(token in lowered for token in tokens):
            benefits.append(label)
    return benefits[:4]


def infer_collections(text: str):
    lowered = text.lower()
    collection_map = [
        ("Ultimune", ["ultimune"]),
        ("Shiseido Eudermine", ["eudermine"]),
        ("Benefiance", ["benefiance"]),
        ("Vital Perfection", ["vital perfection"]),
        ("Future Solution LX", ["future solution lx", "future solution"]),
        ("Bio-Performance", ["bio-performance", "bio performance"]),
        ("Essential Energy", ["essential energy"]),
        ("White Lucent", ["white lucent"]),
        ("Waso", ["waso"]),
    ]
    collections = []
    for label, tokens in collection_map:
        if any(token in lowered for token in tokens):
            collections.append(label)
    return collections


def infer_concerns(text: str):
    lowered = text.lower()
    concern_map = [
        (
            "Anti-Aging",
            [
                "anti-aging",
                "anti aging",
                "age-defying",
                "age defying",
                "age-defiant",
                "age defiant",
                "wrinkle",
                "wrinkles",
                "firming",
                "lifting",
                "sagging",
                "loss of elasticity",
            ],
        ),
        (
            "Dullness & Dark Spots",
            [
                "dull",
                "dullness",
                "dark spot",
                "dark spots",
                "hyperpigmentation",
                "discoloration",
                "uneven tone",
                "brighten",
                "brightening",
                "radiance",
                "radiant",
                "glow",
                "luminous",
            ],
        ),
        (
            "Fine Lines & Wrinkles",
            [
                "fine line",
                "fine lines",
                "wrinkle",
                "wrinkles",
                "crow's feet",
                "crow’s feet",
            ],
        ),
        (
            "Lifting & Firming",
            ["lifting", "firming", "elasticity", "contour", "tighten", "tightening"],
        ),
        (
            "Dryness & Dehydration",
            [
                "dryness",
                "dry",
                "dehydration",
                "dehydrated",
                "hydrate",
                "hydration",
                "moisture",
                "moisturize",
                "moisturizing",
                "hyaluronic",
            ],
        ),
        ("Oil Control", ["oil control", "oil-control", "oily", "shine", "sebum", "matte"]),
    ]
    concerns = []
    for label, tokens in concern_map:
        if any(token in lowered for token in tokens):
            concerns.append(label)
    return concerns


def infer_shop_categories(name: str, description: str, category_label: str, product_type: str):
    text = " ".join(filter(None, [name, description, category_label])).lower()
    categories = []

    def add(label: str):
        if label not in categories:
            categories.append(label)

    if product_type == "cleanser":
        add("Cleansers & Makeup Removers")
    if product_type == "toner":
        add("Softeners")
    if product_type in ("serum", "essence", "oil"):
        add("Serums & Treatments")
    if product_type == "moisturizer":
        add("Moisturizers & Creams")
    if product_type == "eye care":
        add("Eye & Lip Care")
    if product_type == "mask":
        add("Masks")

    if any(
        token in text
        for token in [
            "cleanser",
            "cleansing",
            "makeup remover",
            "micellar",
            "cleansing oil",
            "cleansing water",
            "remover",
        ]
    ):
        add("Cleansers & Makeup Removers")
    if any(token in text for token in ["softener", "treatment softener", "skin softener"]):
        add("Softeners")
    if any(
        token in text
        for token in ["serum", "treatment", "concentrate", "ampoule", "essence", "booster"]
    ):
        add("Serums & Treatments")
    if any(
        token in text
        for token in ["moisturizer", "moisturizing", "cream", "gel-cream", "gel cream", "lotion", "emulsion"]
    ):
        add("Moisturizers & Creams")
    if any(token in text for token in ["eye", "lip", "eye cream", "eye mask", "lip balm"]):
        add("Eye & Lip Care")
    if "mask" in text:
        add("Masks")
    if any(token in text for token in ["refill", "refillable"]):
        add("Refillable Skincare")
    if any(token in text for token in ["best seller", "bestseller", "best-seller"]):
        add("Best Sellers")
    if any(token in text for token in ["last chance", "last-chance", "final sale", "discontinued"]):
        add("Last Chance")
    return categories


def extract_spf(text: str):
    match = re.search(r"spf\s*(\d+)", text, re.IGNORECASE)
    return int(match.group(1)) if match else None


def extract_size_ml(text: str):
    match = re.search(r"(\d+)\s*ml", text, re.IGNORECASE)
    return int(match.group(1)) if match else None


def build_image_index(images_root: Path):
    index = {}
    if not images_root.exists():
        return index
    for path in images_root.rglob("*"):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
            rel_path = path.relative_to(ROOT).as_posix()
            index.setdefault(path.name, rel_path)
    return index


def compact(product: dict):
    return {key: value for key, value in product.items() if value not in (None, "", [], {})}


def main():
    image_index = build_image_index(IMAGES_ROOT)
    products_by_key = {}

    with open(CSV_PATH, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            name_url = normalize_inline(row.get("Name_URL"))
            name = normalize_inline(row.get("product_title") or row.get("Name"))
            description = normalize_block(row.get("Description"))
            composition = normalize_block(row.get("Text"))
            how_to_use = normalize_block(row.get("how_to_use"))
            results_timeline = normalize_inline(row.get("results"))
            category = normalize_inline(row.get("category") or row.get("Category"))
            collection = normalize_inline(row.get("Collection"))
            price = parse_price(row.get("price_current"))
            star_rating = parse_rating(row.get("star_rating"))
            reviews = parse_review_count(row.get("Reviews"))
            variants = parse_variants(row.get("variants"))

            key = name_url or name
            if not key:
                continue

            product = products_by_key.get(key)
            if not product:
                product_type = infer_product_type(name)
                category_label = normalize_category(category, product_type)
                combined_text = " ".join(filter(None, [name, description, composition]))
                product = {
                    "id": None,
                    "name": name,
                    "category": category_label,
                    "product_type": product_type,
                    "price": price,
                    "star_rating": star_rating,
                    "reviews": reviews,
                    "description": normalize_inline(description) or None,
                    "composition": composition or None,
                    "ingredients": extract_ingredients(composition),
                    "how_to_use": how_to_use or None,
                    "results_timeline": results_timeline or None,
                    "variants": variants,
                    "features": extract_features(description, composition),
                    "benefits": infer_benefits(combined_text),
                    "collections": [collection] if collection else infer_collections(combined_text),
                    "concerns": infer_concerns(combined_text),
                    "categories": infer_shop_categories(
                        name, normalize_inline(description), category_label, product_type
                    ),
                    "spf": extract_spf(combined_text),
                    "size_ml": extract_size_ml(combined_text),
                    "image_url": None,
                    "image_gallery": [],
                    "tags": [],
                }
                products_by_key[key] = product
            else:
                if not product.get("description") and description:
                    product["description"] = normalize_inline(description)
                if not product.get("price") and price is not None:
                    product["price"] = price
                if not product.get("star_rating") and star_rating is not None:
                    product["star_rating"] = star_rating
                if not product.get("reviews") and reviews is not None:
                    product["reviews"] = reviews
                if not product.get("how_to_use") and how_to_use:
                    product["how_to_use"] = how_to_use
                if not product.get("results_timeline") and results_timeline:
                    product["results_timeline"] = results_timeline

            image_path = None
            saved_to = normalize_inline(row.get("URL_Saved_To"))
            if saved_to:
                image_path = image_index.get(Path(saved_to).name)
            if not image_path:
                image_path = normalize_inline(row.get("URL"))

            if image_path:
                gallery = product.setdefault("image_gallery", [])
                if image_path not in gallery:
                    gallery.append(image_path)
                if not product.get("image_url"):
                    product["image_url"] = image_path

    products = []
    for idx, product in enumerate(sorted(products_by_key.values(), key=lambda p: p.get("name", ""))):
        product["id"] = f"shiseido-{idx + 1}"
        products.append(compact(product))

    OUTPUT_PATH.write_text(json.dumps({"products": products}, indent=2), encoding="utf-8")
    print(f"Wrote {len(products)} products to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
