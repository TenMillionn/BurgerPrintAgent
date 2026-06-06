# Implementation Plan: Create Order with Sandbox Mode

**Branch**: `006-create-order-sandbox` | **Date**: 2026-06-06 | **Spec**: [spec.md](file:///home/letattuan/work/BurgerPrintAgent/specs/006-create-order-sandbox/spec.md)

## Summary

Implement a feature to create BurgerPrints orders with a sandbox/production toggle. Support three order flows: catalog SKU with designs, product/variant IDs, and shipping labels. Update the `BurgerPrintsService` and `BurgerPrintToolService` `createOrder` methods to accept the expanded payload and correctly map it to the external API, ensuring sandbox defaults to true.

## Technical Context

**Language/Version**: TypeScript / NestJS

**Primary Dependencies**: `@nestjs/axios` for HTTP requests

**Storage**: None (pass-through API)

**Testing**: Jest (unit tests if applicable, but currently manual testing focus via agent)

**Target Platform**: Backend API Service

**Project Type**: web-service

**Performance Goals**: N/A

**Constraints**: Sandbox must default to true.

**Scale/Scope**: Single endpoint integration update.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No specific constitution file loaded, proceeding with standard best practices.

## Project Structure

### Documentation (this feature)

```text
specs/006-create-order-sandbox/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── contracts/           # Phase 1 output
```

### Source Code

```text
backend/src/burgerprints/
├── burgerprints.service.ts
└── burgerprints-tool.service.ts
```

**Structure Decision**: Modifying existing services in `backend/src/burgerprints/` to expand the `createOrder` parameter types and mapping logic.

## Phase 0: Research

**Decision**: Expand the `createOrder` method signature to accept all optional fields specified by the BurgerPrints v2 API.
**Rationale**: The current `createOrder` method is too restrictive, only allowing `catalog_sku` and front URLs. By expanding the type, we enable all three user stories (catalog SKU, product ID, shipping label) natively.
**Alternatives considered**: Create separate methods for each order type (e.g. `createOrderWithLabel`, `createOrderFromCampaign`), but since the BurgerPrints API uses a single `/v2/order` endpoint with flexible fields, a unified method with optional fields is cleaner and matches the external API structure.

## Phase 1: Design & Contracts

The payload contract for `createOrder` will be updated to:

```typescript
type CreateOrderPayload = {
  shipping: {
    name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country: string;
    email?: string;
    phone?: string;
  };
  shipping_method?: 'economy' | 'standard' | 'express' | 'priority express';
  production_service?: 'Priority';
  additional_service?: 'ProActive Tracking';
  callback_url?: string;
  shipping_label?: string;
  sandbox?: boolean;
  fulfillment_partner?: string;
  reference_order_id?: string;
  items: Array<{
    catalog_sku?: string;
    product_id?: string;
    variant_id?: string;
    quantity: number;
    design_url_front?: string;
    design_url_back?: string;
    design_url_sleeve?: string;
    mockup_url_front?: string;
    mockup_url_back?: string;
    mockup_url_sleeve?: string;
    reference_item_id?: string;
  }>;
};
```

This ensures we can handle:
1. `catalog_sku` with designs
2. `product_id` + `variant_id`
3. `shipping_label` (where `shipping.country` is the only required shipping field)

The logic in `createOrder` will:
1. Map these fields directly to the BurgerPrints body format.
2. Validate that `items` is not empty.
3. Validate required shipping fields *unless* `shipping_label` is present.
4. Default `sandbox` to `true`.
