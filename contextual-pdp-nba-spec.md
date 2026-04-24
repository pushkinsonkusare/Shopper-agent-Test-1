Contextual PDP NBA Product Spec
===============================

Purpose
-------
Define how next-best-action (NBA) chips shown after a product detail page (PDP)
interaction should become context-aware, confidence-building, and conversion-
oriented instead of generic.

Problem Statement
-----------------
The current PDP follow-up chips are too static. They often show the same FAQ and
browse actions regardless of the product, shopper intent, objections, or cart
state. This creates three issues:

1. The experience feels generic rather than tailored to the shopper.
2. The chips do not consistently address the reason a shopper is hesitating.
3. The chip set does not reliably move the shopper toward add-to-cart, a better
   fit alternative, or the next routine step.

Product Goal
------------
After a shopper lands on or interacts with a PDP, the NBA chips should help them
do one of the following:

1. Build confidence in the product they are viewing.
2. Take the next step toward purchase.
3. Discover the most relevant complementary product.
4. Recover gracefully when the current product may not be the best fit.

Success Criteria
----------------
The PDP NBA experience should:

- Feel specific to the product and shopper context.
- Surface the most likely objection or next step.
- Increase add-to-cart rate from PDP conversations.
- Increase productive follow-up interactions.
- Reduce generic "browse more" behavior when a better contextual action exists.

Non-Goals
---------
- Rebuilding the overall chat architecture.
- Generating free-form NBA copy with an LLM at runtime.
- Replacing the full PDP card or checkout logic.
- Solving personalization beyond session-level context in v1.

Design Principles
-----------------
1. Be contextual, not generic.
   Chips should reflect the product type, product attributes, session intent,
   and shopper stage.

2. Resolve friction before expanding choice.
   If the shopper is hesitating, answer the likely concern before showing broad
   discovery actions.

3. Promote one clear next step.
   At least one chip should move the shopper closer to purchase.

4. Redirect only when there is evidence of mismatch.
   Alternative suggestions should appear when the current product may be wrong
   for the shopper, not as default noise.

5. Keep the chip set compact.
   Show 3 to 4 strong actions, not 5 generic ones.

User Jobs To Be Done
--------------------
When I am considering a product on the PDP, help me:

- Understand whether the product is right for me.
- Resolve my biggest concern quickly.
- See how the product fits into my routine or regimen.
- Pick the next best action without restarting my shopping journey.

Target User States
------------------
1. Evaluating fit
   The shopper wants to know if the product is suitable.

2. Handling objections
   The shopper is worried about formula, scent, finish, usage, compatibility,
   price, or safety.

3. Ready to buy
   The shopper is close to purchase and needs a final confidence boost.

4. Recovering from mismatch
   The shopper may need a better alternative rather than more reassurance.

NBA Chip Framework
------------------
Each PDP NBA row should be composed from up to four chip slots:

1. Confidence
   Answers the strongest likely objection for this product.

2. Commitment
   Encourages a purchase-adjacent action.

3. Routine
   Shows what complements this product or where it fits in usage order.

4. Redirect
   Offers a better-fit alternative only when mismatch risk is meaningful.

Recommended Display Rules
-------------------------
- Default to 3 chips.
- Expand to 4 chips when there is a strong redirect or routine opportunity.
- Always include at least 1 confidence or commitment chip.
- Never show more than 1 redirect chip.
- Avoid generic operational chips unless the shopper explicitly signals that need.

Context Inputs
--------------
The chip selector should rank actions using the following context:

1. Product context
- Category and product type
- Key attributes such as fragrance-free, active ingredients, finish, scent
  family, color-safe, waterproof, SPF, or texture
- Price tier
- Review density and rating
- Variant complexity

2. Conversation context
- Shopper's most recent question
- Repeated concerns or objections
- Search/refinement history in the session
- Signals such as budget sensitivity, ingredient sensitivity, routine building,
  or comparison behavior

3. Journey context
- Whether the shopper is browsing, evaluating, comparing, or ready to purchase
- Whether they already asked a PDP FAQ
- Whether they rejected a prior recommendation

4. Cart/routine context
- What is already in cart
- Missing routine steps
- Duplicative products already selected
- Cross-sell opportunities that make sense for the current item

Decision Model
--------------
Step 1: Infer shopper stage

- Evaluation: asks about fit, ingredients, scent, finish, usage
- Objection handling: shows concern about irritation, texture, longevity,
  performance, or compatibility
- Purchase-ready: engages with quantity, size, shade, reviews, add-to-cart
- Mismatch-risk: asks for alternatives or expresses doubt that the product fits

Step 2: Generate candidate actions

- Product-specific FAQs
- Product-specific reassurance actions
- Routine or pairing actions
- Alternative-fit actions
- Broad discovery actions only as fallback

Step 3: Score candidates

Suggested scoring signals:

- +4 directly answers the strongest likely objection
- +3 matches recent shopper language
- +3 supports conversion right now
- +2 uses known product attributes
- +2 matches cart or routine context
- -3 is generic across many PDPs
- -4 duplicates a recently answered question
- -5 is weakly relevant to the product type

Step 4: Select final chips

- Pick the highest scoring confidence chip
- Pick the highest scoring commitment chip
- Pick the highest scoring routine chip if relevant
- Pick the highest scoring redirect chip only if mismatch risk is above threshold
- Use a broad fallback chip only if a slot cannot be filled contextually

Candidate Actions By Intent
---------------------------
Confidence chips

- Good for sensitive skin?
- How do I use this?
- What does it feel like?
- Will this leave a white cast?
- What does it smell like?
- Is it color-safe?
- How long does it wear?
- What are the ingredients?

Commitment chips

- Is this a good first pick?
- Which size should I choose?
- How long will this last?
- Show reviews from similar shoppers
- Best way to start with this
- Add this to my routine

Routine chips

- What pairs well with this?
- What goes before this?
- What goes after this?
- Build a simple routine around this
- Find a matching cleanser
- Find a compatible moisturizer

Redirect chips

- Need a gentler option?
- Show fragrance-free alternatives
- Show richer options
- Show lightweight alternatives
- Show better options for oily skin
- Compare with a bestseller

Broad fallback chips

- Show bestsellers
- Show top rated in this category
- Compare similar products

Product Family Guidelines
-------------------------
Skincare

Prioritize:
- Sensitive skin compatibility
- Active ingredient strength
- Routine order
- Texture and finish
- Fragrance-free status

Good examples:
- Good for sensitive skin?
- How often should I use this?
- What goes after this?
- Need a gentler alternative?

Makeup

Prioritize:
- Finish
- Wear time
- Shade/undertone confidence
- Transfer resistance
- Skin type compatibility

Good examples:
- What finish does this have?
- Is it long-wearing?
- Good for dry skin?
- Show a more natural finish

Fragrance

Prioritize:
- Scent profile
- Strength and longevity
- Day vs night fit
- Seasonality or occasion

Good examples:
- What does it smell like?
- How long does it last?
- Better for day or night?
- Show a fresher alternative

Haircare

Prioritize:
- Hair type fit
- Color safety
- Repair vs hydration
- Usage frequency

Good examples:
- Is it color-safe?
- Best for dry or damaged hair?
- How often should I use it?
- Show a lighter option

Example Chip Sets
-----------------
Example A: Vitamin C serum

- Can I use this every day?
- Will this help with dark spots?
- What goes after this?
- Show a gentler brightening option

Example B: Fragranced moisturizer

- Good for sensitive skin?
- How does this feel on skin?
- What pairs well with this?
- Need a fragrance-free alternative?

Example C: Mineral sunscreen

- Will this leave a white cast?
- Good under makeup?
- What cleanser removes this well?
- Show fragrance-free SPF options

Example D: Perfume

- What does it smell like?
- How long does it last?
- Best for day or night?
- Show a fresher alternative

Fallback Rules
--------------
Use a generic chip only when:

- Product metadata is too sparse to infer meaningful objections
- The shopper has not provided enough context yet
- No product-specific pairing or redirect action is valid

Even in fallback mode, the system should prefer category-relevant discovery over
truly generic operational questions.

V1 Rollout Recommendation
-------------------------
Phase 1: Product-aware chips
- Replace static PDP actions with product-family-specific chips
- Remove always-on generic actions unless no contextual option exists

Phase 2: Session-aware ranking
- Boost chips that match recent shopper questions or refinement behavior
- Suppress chips that repeat what was already answered

Phase 3: Cart and routine awareness
- Use in-cart products and routine gaps to choose pairings and redirects

Phase 4: Optimization
- Tune chip scoring and thresholds using interaction data

Measurement Plan
----------------
Primary metrics
- PDP chip click-through rate
- Add-to-cart rate after PDP chip interaction
- Conversion rate after PDP chip interaction

Secondary metrics
- Alternative-product click-through rate
- Routine/pairing click-through rate
- FAQ deflection success
- Reduction in generic chip usage

Quality metrics
- Repeated chip rate in a single session
- Irrelevant chip feedback rate
- Share of chip rows containing at least one contextual action

Open Questions
--------------
1. Should the experience always reserve one slot for purchase-forward actions?
2. How aggressive should redirect behavior be when mismatch risk is only moderate?
3. Should review-based reassurance chips be introduced in v1 or v2?
4. What minimum metadata is required for each product family to support good chips?

Recommended v1 Direction
------------------------
The first release should move from a static PDP chip list to a ranked,
contextual chip selector that prioritizes:

1. Likely objection resolution
2. Clear next-step conversion actions
3. Routine-aware pairings
4. Better-fit alternatives only when justified

This will make the PDP NBA experience feel less generic, more useful, and more
aligned to the shopper's actual buying journey.
