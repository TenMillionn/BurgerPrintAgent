# Data Model

## Entities

### `DraftOrder` (Frontend State)
Represents the state of the wizard in the frontend.
- `productId`: string
- `color`: string
- `size`: string
- `designFile`: File | null (for upload)
- `shippingAddress`:
  - `fullName`: string
  - `email`: string
  - `phone`: string
  - `country`: string
  - `state`: string
  - `city`: string
  - `street`: string
  - `zipcode`: string
- `shippingService`: string (Standard, Express)

### `CostCalculationRequest` (Backend API payload)
- `productId`: string
- `country`: string
- `state`: string

### `CostCalculationResponse` (Backend API response)
- `productionFee`: number
- `shippingOptions`: Array of:
  - `service`: string (e.g., 'Standard', 'Express')
  - `cost`: number
  - `estimatedDays`: string

### `BurgerPrintsOrderPayload` (Backend to External API)
- Mapped from `DraftOrder` + finalized costs. Matches the external API specification for BurgerPrints.
