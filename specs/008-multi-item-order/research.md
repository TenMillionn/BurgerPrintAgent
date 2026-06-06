# Phase 0: Research & Decisions

## Context
The feature branch `[008-multi-item-order]` implements a multi-item ordering flow in the frontend. It involves defining the UI for adding multiple items to an order, and the required backend integrations to load product and variant data for the configuration wizard.

## Decisions

### 1. Catalog API Endpoints
**Decision**: Expose BurgerPrint catalog capabilities via REST endpoints in `OrdersController` (or a dedicated `CatalogController`).
**Rationale**: The frontend needs a way to query the database for product details, available factories, and variants to populate the UI dropdowns. `BurgerPrintToolService` already implements the logic, we just need to expose it over HTTP so the frontend can consume it.
**Alternatives considered**: Calling the tools indirectly via chat. Rejected because the UI needs deterministic, immediate JSON responses, not agentic text generation.

### 2. Frontend State Management
**Decision**: Refactor `OrderContext.jsx` to support an array of `items` rather than a single item configuration. 
**Rationale**: Required to fulfill FR-009 (Add Another Item button) and User Story 3. The context will maintain an `items` array, and the `WizardLayout` will iterate through them or allow switching between them.
**Alternatives considered**: Local state in components. Rejected because order configuration state must be maintained across steps and eventually submitted together.

### 3. Design Image Input
**Decision**: Use raw text input fields for `mockup_url` and `design_url` as clarified in the session.
**Rationale**: Simplifies MVP by bypassing file upload infrastructure. Users can just paste existing S3 or Imgur links.

## Conclusion
All technical unknowns are resolved. The backend will expose 4 new GET endpoints for the catalog. The frontend will update `OrderContext` to manage an array of items and implement the UI changes to support raw URL inputs and multi-item building.
