Product Listing Carousel (Chat Response)
=======================================

Purpose
-------
Show search results as a swipeable product carousel inside the chat, with a
short assistant message + follow-up quick filters.

Message Structure
-----------------
1) Assistant message summary
2) Carousel (cards)
3) Quick filters (chips)
4) Input box

Assistant Message Template
--------------------------
Thanks for your patience. I found a few great options for {intent} based on
{key_constraints}.

Carousel Card Layout
--------------------
Top-left: Select checkbox
Top-right: Optional “saved” icon
Center: Product image
Bottom area:
- Product name (2 lines max)
- Short benefit line (1 line)
- Price (current + optional strike-through MSRP)
- Color dots (up to 4, +N overflow)

Card Data Requirements (JSON)
-----------------------------
{
  "id": "string",
  "name": "string",
  "image_url": "string",
  "price": 129.00,
  "msrp": 159.00,
  "currency": "USD",
  "benefit": "string",
  "colors": ["black", "navy"],
  "rating": 4.6,
  "review_count": 312
}

Quick Filter Chips (examples)
-----------------------------
- below $100
- waterproof
- lightweight
- best rated
- more suggestions

Example Result Payload
----------------------
{
  "assistant_message": "Thanks for your patience. I found a few great options for a lightweight hiking shell under $200.",
  "results": [
    {
      "id": "tnf-m-jacket-0001",
      "name": "Summit Ridge Shell",
      "image_url": "https://example.com/images/summit-ridge-shell.jpg",
      "price": 179.00,
      "msrp": 219.00,
      "currency": "USD",
      "benefit": "Waterproof, breathable, and packable for rainy hikes.",
      "colors": ["black", "summit navy", "olive"],
      "rating": 4.7,
      "review_count": 418
    },
    {
      "id": "tnf-w-jacket-0004",
      "name": "Rainshadow Shell",
      "image_url": "https://example.com/images/rainshadow-shell.jpg",
      "price": 199.00,
      "msrp": 229.00,
      "currency": "USD",
      "benefit": "Taped seams and pit zips for all-day rain.",
      "colors": ["black", "glacier blue"],
      "rating": 4.5,
      "review_count": 256
    },
    {
      "id": "tnf-m-jacket-0003",
      "name": "Trail Windbreaker",
      "image_url": "https://example.com/images/trail-windbreaker.jpg",
      "price": 129.00,
      "msrp": 149.00,
      "currency": "USD",
      "benefit": "Ultra-light wind protection for quick hikes.",
      "colors": ["smoke", "olive"],
      "rating": 4.3,
      "review_count": 190
    }
  ],
  "chips": ["below $200", "waterproof", "lightweight", "best rated", "more suggestions"]
}
