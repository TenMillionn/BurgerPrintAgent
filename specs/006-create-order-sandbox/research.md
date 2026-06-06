# Research: Create Order with Sandbox Mode

## Decision
Expand the `createOrder` method signature in `BurgerPrintsService` and `BurgerPrintToolService` to accept all optional fields specified by the BurgerPrints v2 API, rather than creating separate methods for each flow.

## Rationale
The current `createOrder` method only allows `catalog_sku` and front URLs. By expanding the type:
- We natively support all three user stories (catalog SKU, product ID, shipping label) through a single unified method.
- It aligns perfectly with how the underlying BurgerPrints API `/v2/order` endpoint functions, avoiding unnecessary abstraction layers that could complicate future API updates.
- Centralizing the logic makes it easier to enforce the `sandbox: true` default safely in one place.

## Alternatives considered
- **Separate Methods**: E.g., `createOrderWithLabel`, `createOrderFromCampaign`. Rejected because the underlying API endpoint is exactly the same, and separating them would lead to duplicate HTTP request logic and potentially missed edge cases when defaulting the `sandbox` field.
