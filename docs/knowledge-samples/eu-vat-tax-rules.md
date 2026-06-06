# EU VAT — when to charge tax on an order

Use this when a seller asks whether VAT/tax should be charged on an EU order, or how much.

**Scope & assumptions**
- The seller has a company in the EU.
- "EU VAT number" = the seller's tax code (mã số thuế). A seller either has filled one or not.
- "Factory country" = the country where the order is fulfilled/produced. "Ship-to country" = the buyer's delivery country.
- These rules cover orders shipped **within the EU**. Orders shipped outside the EU are out of scope.

## Rule — is VAT charged on this order?

1. **Seller has NO EU VAT number** → **charge VAT on ALL orders** shipped within the EU.

2. **Seller HAS filled an EU VAT number** → it depends on the ship-to country vs the factory country:
   - Ship-to country **= factory country** → **CHARGE VAT**.
   - Ship-to country **≠ factory country** (a different EU country) → **DO NOT charge VAT**.

## Which VAT rate to apply (only when VAT is charged)
Apply the **standard VAT rate of the country whose VAT applies** (normally the country where the supply is taxed). VAT rates change every year, so do **not** rely on memorized numbers — **fetch the latest rates from the source**:

- Source: https://taxfoundation.org/data/all/eu/value-added-tax-vat-rates-europe/
- Read that page (fetch it) to get the current **standard VAT rate** for the relevant country, then apply it.

## How to answer the seller
1. If missing, ask: **Does the seller have an EU VAT number?** **What is the factory country and the ship-to country?**
2. Apply the rule above to state clearly whether VAT is charged.
3. If VAT is charged, fetch the source above for the relevant country's standard VAT rate and use that exact percentage. Cite the rate as "current standard VAT rate" since rates change yearly.

### Quick examples
- No VAT number, ship to Germany → charge VAT (use Germany's current standard rate).
- Has VAT number, factory in Germany, ship to Germany → charge VAT (Germany's rate).
- Has VAT number, factory in Germany, ship to France → **no VAT charged**.
