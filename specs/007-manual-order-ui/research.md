# Phase 0: Research & Decisions

## Context
The project requires a 3-step manual order UI with dynamic shipping cost calculation based on weight and region lookup tables, submitting to the BurgerPrints Sandbox API.

## Decisions

### Decision 1: Cost Calculation Logic Location
- **Decision**: Backend (`orders` module or similar service).
- **Rationale**: Shipping and production cost matrices (based on weight/region) should be secure and centralized on the backend. The frontend will hit an endpoint `/api/orders/calculate-cost` with the selected product and shipping address.
- **Alternatives considered**: Calculating in the frontend (rejected due to exposing pricing matrices and business logic).

### Decision 2: State Management for the Wizard
- **Decision**: React state (e.g., `useState` or context) within the top-level `ManualOrderWizard` component.
- **Rationale**: The wizard state is ephemeral and only needs to live until submission. Redux/Zustand is overkill for a localized 3-step wizard.
- **Alternatives considered**: Persisting to local storage (could be added later if draft saving is required, but unnecessary for MVP).

### Decision 3: Sandbox API Integration
- **Decision**: Use existing `BurgerprintsToolService` or a dedicated `OrdersService` that acts as an API client to BurgerPrints Sandbox API.
- **Rationale**: Keeps external integration logic encapsulated in the backend.
