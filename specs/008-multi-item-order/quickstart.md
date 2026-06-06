# Quickstart: Multi-Item Order UI

## Developer Workflow

1. **Backend Endpoints**: First implement the new catalog GET endpoints in `backend/src/orders/orders.controller.ts`.
2. **Frontend Service**: Update `frontend/src/services/api.js` with methods to call these new endpoints.
3. **Frontend State**: Update `frontend/src/components/ManualOrderWizard/OrderContext.jsx` to manage an array of `items` rather than a single item state.
4. **UI Updates**:
   - Add "Add Another Item" button in `ItemsStep.jsx`.
   - Update `ItemsStep.jsx` to iterate over items and allow selecting Product, Partner, Variant (Color/Size) for each.
   - Dynamically render inputs for `design_url` and `mockup_url` based on the product's `printAreas` and use the selected `color_hex` for the background.
5. **Testing**: Run the local dev server and ensure that configuring multiple items successfully groups them into the `CreateOrderPayload` and sends them to the backend.
