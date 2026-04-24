NBA Journey Product Spec
========================

Purpose
-------
Define a single product spec for next-best-actions (NBAs) across the full
shopper journey:

1. Home / landing / welcome card
2. Product discovery questions
3. Product listing page (PLP) results
4. Product detail page (PDP)
5. Cart confirmation
6. Order confirmation
7. Where is my order (WISMO) result

This spec is intended to make NBA behavior feel connected across the journey
instead of appearing as isolated chip sets at each step.

Problem Statement
-----------------
Today, many NBA surfaces are useful but static. They often rely on hardcoded
prompts or generic follow-up actions that do not fully reflect:

- The shopper's current goal
- The product category or product attributes
- The stage of the buying journey
- The shopper's prior choices in the session
- The cart or order context

As a result, the experience can feel generic, repetitive, or too browse-heavy
at moments where the best next action should be clearer.

Product Vision
--------------
At every step of the journey, the NBA system should answer one question:

"What is the most helpful next action for this shopper right now?"

That action may help the shopper:

- Start faster
- Clarify intent
- Refine discovery
- Build confidence
- Complete purchase
- Manage an order
- Recover from friction

Core Principles
---------------
1. Stage-aware
   NBAs should reflect where the shopper is in the journey.

2. Context-aware
   NBAs should use product, cart, order, and conversation context.

3. Conversion-aware
   NBAs should prefer actions that move the shopper forward.

4. Friction-first
   When hesitation or confusion is detected, resolve that before expanding
   choice.

5. Compact and focused
   Show a small number of high-confidence actions, not a wide list.

6. Non-redundant
   Avoid repeating recently answered or already dismissed actions.

NBA System Goals
----------------
- Increase productive chip engagement
- Increase add-to-cart rate
- Increase checkout and order-completion rate
- Increase self-service success for post-purchase journeys
- Reduce dead-end or generic interactions

Non-Goals
---------
- Replacing free-text chat
- Solving long-term shopper personalization in v1
- Generating NBA labels with fully dynamic LLM copy in production
- Redesigning all visual UI components in this phase

Shared NBA Model
----------------
All NBA surfaces should select actions from a common action taxonomy.

Action Types
------------
1. Start
   Helps the shopper begin quickly.

2. Clarify
   Asks for a missing preference or context signal.

3. Refine
   Narrows a result set.

4. Confidence
   Resolves hesitation or answers a likely objection.

5. Commit
   Moves toward cart, checkout, or a confident next purchase step.

6. Complement
   Suggests a relevant pairing, accessory, or routine step.

7. Redirect
   Offers a better-fit path when there is mismatch risk.

8. Support
   Helps with post-purchase actions such as tracking, returns, and changes.

Common Inputs For Ranking
-------------------------
All NBA surfaces should consider the following signals where applicable:

1. Session context
- Recent user prompts
- Recently clicked chips
- Repeated concerns
- Current intent category
- Abandonment or hesitation signals

2. Catalog or product context
- Category and product type
- Price tier
- Attributes such as fragrance-free, finish, active ingredients, color-safe,
  waterproof, scent family, or routine role
- Rating and review count

3. Cart context
- Items already added
- Category mix
- Missing routine or bundle opportunities
- Coupon or pricing state

4. Order context
- Shipment stage
- Estimated delivery date
- Number of items
- Return eligibility

5. Journey stage
- Landing
- Discovery
- Evaluation
- Purchase-ready
- Post-purchase support

Global Selection Rules
----------------------
- Default to 3 chips.
- Allow 4 chips when there is strong contextual value.
- Always include at least one action that moves the shopper forward.
- Avoid more than one broad fallback action.
- Avoid showing two actions that solve the same problem.
- Suppress actions already answered or clicked recently.

Suggested Scoring Model
-----------------------
Each candidate action may receive a score using signals such as:

- +4 directly answers likely intent or friction
- +3 matches recent shopper language
- +3 moves the journey forward
- +2 uses trusted structured context
- +2 reduces risk or confusion
- -3 is generic across many scenarios
- -4 duplicates a recent action
- -5 is weakly relevant to the current stage

Journey Surface Specs
---------------------

1) Home / Landing / Welcome Card
--------------------------------
Primary objective

- Help the shopper start quickly and confidently.

Shopper mindset

- Open-ended browsing
- Early intent formation
- Low willingness to type

NBA role

- Offer strong starting points instead of generic category browsing.

Recommended action mix

- 2 `Start` chips
- 1 `Clarify` chip
- 1 `Support` chip if recent order history exists

Good chip categories

- Shop by concern
- Shop by category
- Shop by routine step
- Resume or support a recent order
- More suggestions / refresh

Good examples for beauty

- Shop by skin concern
- Find my ideal sunscreen
- Build a simple skincare routine
- Track my recent order

Ranking signals

- If there is a recent order, boost support entry points
- If the brand wants to push a hero category, boost a guided start chip rather
  than a generic bestseller chip
- If the shopper is returning in-session, boost continuation-oriented chips

Guardrails

- Do not overload the first screen with too many broad options
- Prefer intent-led entries over generic merchandising

Success metrics

- Welcome chip click-through rate
- Time to first meaningful action
- Share of sessions that reach discovery or support flows

2) Product Discovery Questions (Conversation Context Setting)
-------------------------------------------------------------
Primary objective

- Collect the minimum context needed to improve recommendations.

Shopper mindset

- They have a direction, but the system needs more specifics.

NBA role

- Ask focused clarifying questions that unlock better search results.

Recommended action mix

- 3 to 5 `Clarify` chips
- Optional `Skip` action when uncertainty is valid

Good clarifying dimensions

- Concern or goal
- Skin type / hair type / fragrance preference
- Usage context
- Climate / environment
- Budget
- Routine preference
- Gender / recipient / self vs gift when relevant

Good examples

- Anti-aging
- Dryness & dehydration
- Sensitive skin
- Lightweight for day
- Fragrance-free
- Not sure

Ranking signals

- Ask the highest-value missing question first
- Prefer one dimension at a time
- Use category-specific questions only when category confidence is high

Guardrails

- Avoid asking questions that do not change ranking or recommendations
- Do not ask more than 3-4 sequential clarifiers without showing value
- Always support a "not sure" path

Success metrics

- Clarifier completion rate
- Result quality after clarifier path
- Drop-off rate inside discovery flows

3) PLP
------
Primary objective

- Help the shopper refine results, compare options, and keep momentum.

Shopper mindset

- They have candidate products and need help narrowing choices.

NBA role

- Offer the most relevant refinements and action paths for the current result
  set.

Recommended action mix

- 2 `Refine` chips
- 1 `Confidence` or `Compare` chip
- 1 `Redirect` or `Complement` chip if context supports it

Good chip categories

- Top filters inferred from result attributes
- Compare
- Show similar
- Suggest pairing
- More suggestions
- Budget or skin-type refinements

Good examples

- Under $50
- Fragrance-free only
- Best rated
- For sensitive skin
- Compare

Ranking signals

- Use actual result-set attributes, not static category filters
- Boost filters that meaningfully reduce result count
- Boost compare when at least two strong candidates are selected or visible

Guardrails

- Do not show filters that barely change the result set
- Avoid conflicting filters in the same row
- Keep one chip focused on decision support, not just filtering

Success metrics

- Filter chip CTR
- Compare initiation rate
- PDP click-through after filter engagement
- Add-to-cart rate after PLP NBA interaction

4) PDP
------
Primary objective

- Build product confidence and move the shopper toward purchase or a better fit.

Shopper mindset

- Evaluating a specific product
- Resolving objections
- Deciding whether to buy now

NBA role

- Surface the strongest next action for this product and this shopper.

Recommended action mix

- 1 `Confidence` chip
- 1 `Commit` chip
- 1 `Complement` chip
- 1 `Redirect` chip only when mismatch risk is meaningful

Good chip categories

- Product-specific FAQ
- Product-fit reassurance
- Routine compatibility
- Alternative fit suggestion
- Reviews or usage reassurance

Examples

Skincare:
- Good for sensitive skin?
- How often should I use this?
- What goes after this?
- Need a gentler option?

Makeup:
- What finish does this have?
- Is it long-wearing?
- Good for dry skin?
- Show a more natural finish

Fragrance:
- What does it smell like?
- How long does it last?
- Best for day or night?
- Show a fresher alternative

Guardrails

- Do not default to broad category browsing
- Do not surface operational policies unless signaled by the shopper
- Avoid generic cross-sells that are not routine-aware

Success metrics

- PDP chip CTR
- Add-to-cart rate after PDP NBA interaction
- Alternative-fit recovery rate
- FAQ deflection success rate

5) Cart Confirmation
--------------------
Primary objective

- Reinforce the cart action and guide the shopper to the best next step.

Shopper mindset

- They just added a product and are deciding whether to continue shopping or
  checkout.

NBA role

- Confirm progress, reduce friction, and offer the most relevant next move.

Recommended action mix

- 1 `Commit` chip
- 1 `Complement` chip
- 1 `Support` or savings chip
- 1 `Redirect` chip only if the product may require a paired item

Good chip categories

- Checkout
- View cart details
- Apply coupon / savings
- Build the rest of the routine
- Add a complementary item
- Keep shopping in the same regimen

Good examples

- Proceed to checkout
- Complete my routine
- Add hydration
- Add a remover
- Apply a coupon

Ranking signals

- If the shopper has a near-complete routine, boost checkout
- If there is a strong routine gap, boost one contextual complement chip
- If an inactive coupon exists, boost a savings or qualifying-item action

Guardrails

- Always include at least one checkout-forward action
- Do not overstuff the row with unrelated cross-sells
- Complements must be compatible with what is already in cart

Success metrics

- Checkout continuation rate
- Cart upsell click-through rate
- Coupon application rate
- Time from add-to-cart to next meaningful action

6) Order Confirmation
---------------------
Primary objective

- Reassure the shopper and guide them to the most relevant post-purchase action.

Shopper mindset

- Purchase completed
- Curious about shipment, modifications, returns, and what to do next

NBA role

- Support the order while keeping the door open for thoughtful re-engagement.

Recommended action mix

- 1 `Support` chip
- 1 `Support` or self-service chip
- 1 `Complement` or replenishment chip
- 1 `Redirect` only if relevant to order issues

Good chip categories

- Where is my order?
- Return product
- Update shipping details if still editable
- Buy a complementary product
- Reorder or replenish

Good examples

- Where is my order?
- Return product
- Buy a gentle cleanser
- Hydrating serum

Ranking signals

- If the order is fresh, boost tracking over return flows
- If the order contains a regimen product, boost one relevant complement
- If return risk is signaled, prioritize policy clarity

Guardrails

- Prioritize support and reassurance first
- Only include re-engagement chips that feel natural after purchase
- Avoid making the confirmation screen feel like a hard sell

Success metrics

- Order support self-service rate
- WISMO initiation rate
- Post-purchase re-engagement CTR

7) Where Is My Order (WISMO) Result
-----------------------------------
Primary objective

- Resolve the tracking need quickly, then provide the best next support action.

Shopper mindset

- They want status, confidence, and a clear next step if something is wrong.

NBA role

- Pair status information with the most relevant follow-up options.

Recommended action mix

- 1 `Support` chip related to the current shipment status
- 1 `Support` escalation or resolution chip
- 1 `Commit` or re-engagement chip only if appropriate

Status-aware examples

If in transit:
- Track package details
- Delivery estimate
- Change delivery instructions

If delayed:
- What caused the delay?
- Contact support
- Start a replacement inquiry

If delivered:
- Start a return
- Report an issue
- Buy again

If partially shipped:
- Track remaining items
- View split shipment details
- Contact support

Ranking signals

- Shipment status should drive the first chip
- Only show escalation when it is relevant
- Re-engagement should be secondary to support completion

Guardrails

- Do not mix too many support paths at once
- Do not upsell before resolving the shipment question
- Keep language calm and action-oriented

Success metrics

- WISMO resolution rate
- Follow-up support self-service rate
- Reduced support deflection failure

Cross-Surface Orchestration Rules
---------------------------------
The NBA system should preserve memory across surfaces:

1. If a shopper already answered a clarifier, do not ask it again on the next
   surface.
2. If a shopper dismissed an action twice, suppress it for the remainder of the
   session unless context changes significantly.
3. If a shopper shows high purchase intent, boost commit actions across PLP,
   PDP, and cart.
4. If a shopper shows sensitivity, safety, or fit concerns, boost confidence
   actions before commit actions.
5. If a shopper enters post-purchase support, prioritize support until that need
   is resolved.

Fallback Strategy
-----------------
When contextual confidence is low:

- Use one safe stage-relevant fallback chip
- Prefer category-aware or status-aware fallbacks over global generic actions
- Preserve one action that moves the journey forward

Examples of acceptable fallback chips

- Show best rated
- Compare similar products
- Where is my order?
- Return policy

Measurement Framework
---------------------
Primary journey metrics

- Chip CTR by surface
- Forward progression rate by surface
- Add-to-cart rate
- Checkout completion rate
- Post-purchase self-service success

Quality metrics

- Repeated chip rate
- Irrelevant chip rate
- Generic fallback usage rate
- Multi-click success rate

Diagnostic metrics

- Time to next meaningful action
- Share of sessions using contextual vs fallback actions
- Alternative-fit recovery rate
- Routine-building engagement rate

Rollout Plan
------------
Phase 1: Taxonomy and rules
- Establish shared action types
- Define stage-aware chip templates
- Replace the most generic hardcoded rows

Phase 2: Context ranking
- Use session and structured product signals to rank candidates
- Suppress duplicates and weak actions

Phase 3: Cross-surface memory
- Carry shopper state across landing, discovery, PLP, PDP, cart, and support

Phase 4: Optimization
- Tune thresholds and labels using interaction data

Open Questions
--------------
1. Should each surface reserve one mandatory forward-progression chip?
2. How much merchandising should be allowed in support-oriented contexts?
3. Should post-purchase re-engagement be personalization-driven or rule-based in
   v1?
4. What is the minimum structured data quality needed for high-confidence
   contextual chips on each surface?

Recommended v1 Direction
------------------------
The first release should create consistency before complexity:

1. Standardize a shared NBA taxonomy across all journey surfaces
2. Make each surface stage-aware
3. Replace generic chip rows with ranked contextual actions
4. Preserve one clear next step at every stage
5. Prioritize support resolution in post-purchase flows

If done well, this will make the entire chat journey feel less like a set of
disconnected prompts and more like a single guided shopping and support system.
