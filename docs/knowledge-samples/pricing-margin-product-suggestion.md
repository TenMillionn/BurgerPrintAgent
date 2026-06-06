# Suggesting products by target retail price + minimum margin

Use this when a seller gives a **target selling price** and a **minimum margin** (or profit target) and asks which products fit — e.g. "I want to sell at $X with at least Y% margin, what should I sell?".

## Core idea
A margin target is really a **cost ceiling**. Convert it first, then filter:

```
max base cost = sell_price × (1 − target_margin)
```

Any product whose base cost is ≤ that ceiling meets the margin target. Lower base cost = higher margin. Use the deterministic margin tool for the exact percentage per product — never compute margin in your head.

## ⚠️ Two things that decide a right vs wrong answer

### 1. Clarify what "margin" includes — it changes the ceiling
"Margin" on the product **base cost alone** is NOT the seller's real profit. Other costs eat into it:
- **Shipping** (often paid by the seller; depends on the destination country).
- **Marketplace fees** (e.g. listing + transaction fees, payment processing).
- **Ad spend** (the largest and most variable; usually excluded from "margin" but it determines real profit).

So a "40% margin on base cost" can become a much smaller real profit. Before quoting a ceiling, **ask the seller what the margin should include** (base cost only, or also shipping / fees). If unstated, default to **base cost only**, compute the ceiling on that, and **say so explicitly** — and offer to redo it including shipping (which lowers the ceiling).

### 2. The target price implies a product TYPE — don't ignore it
The selling price anchors what kind of product makes sense. Buyers expect to pay a certain range for each product category. **Do not surface ultra-cheap accessories for a high target price just because their margin is highest** — the math passes but nobody buys that item at that price.

- A high retail price (apparel/decor territory) → recommend apparel, home decor, or similar — not stickers/keychains, even though those have the highest margin %.
- A low retail price → small accessories (stickers, keychains, cards) are the right fit.

The seller wants products that are **both** (a) profitable at the target margin **and** (b) realistic to sell at the target price. Optimize for product-fit first, then rank by margin within the fitting set.

## How to answer
1. If missing, ask or assume-and-state: **which market** (US/EU/UK...), **what the margin includes**, and **what product category** they have in mind.
2. Convert the margin target to a max base cost.
3. Search the catalog within that cost ceiling, **filtered to products that fit the target price** (the right category) — not the absolute cheapest items.
4. Compute the exact margin for the top few with the margin tool.
5. Recommend **2–3 options** that fit the price, each with: base cost, exact margin, factory, colors. Lead with the best fit, not the highest raw margin.
6. State assumptions clearly (margin = base-cost only unless told otherwise; market used) and offer to refine (include shipping, change market, change category).

## What to keep in mind (caveats to surface when relevant)
- **Base cost shown is the cheapest factory** — the seller may pick a different factory for quality/speed; that base is optimistic.
- **Base cost varies by size/variant** — larger sizes (2XL/3XL) usually cost more, so margin drops on those or the price must rise.
- **Stock + freshness** — skip out-of-stock products; base costs change over time.
- **Meeting the margin ≠ it will sell** — a viable margin only means it *can* be profitable; selling at the target price still needs a good design/niche, especially when the price is on the high end for that category.

## Example shape of a good answer (generic)
> To hit a [Y]% margin at [$X], your base cost needs to stay under **[$X × (1 − Y%)]** (counting product cost only — shipping/fees not included).
>
> For that price, [apparel] is the natural fit. Best options:
>
> | Product | Base from | Margin at [$X] | Colors |
> |---|---:|---:|---:|
> | ... | $... | ...% | ... |
>
> **Pick:** *[product]* — lowest base with the most colors, well above your [Y]% target. Want me to redo the margin including shipping to [country], or look at a different product type?
