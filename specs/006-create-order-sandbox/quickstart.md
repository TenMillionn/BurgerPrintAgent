# Quickstart: Create Order with Sandbox Mode

## Testing the Implementation

Once the `createOrder` method is updated in `BurgerPrintsService` and `BurgerPrintToolService`, you can test the three primary flows using the AI agent or directly invoking the services.

### Test 1: Standard Order (Catalog SKU)
1. Provide the agent with:
   - A valid `catalog_sku` (e.g., `US-TShirt-Black-L`).
   - A `design_url_front`.
   - Complete shipping details (name, address1, city, zip, country).
2. Explicitly request sandbox mode (or let it default).
3. Verify that the agent successfully returns a sandbox order ID from BurgerPrints.

### Test 2: Campaign Order (Product & Variant ID)
1. Provide the agent with:
   - An existing `product_id`.
   - An existing `variant_id`.
   - Complete shipping details.
2. Verify that the order is successfully created in sandbox mode.

### Test 3: Shipping Label Order
1. Provide the agent with:
   - A valid `catalog_sku`.
   - A `shipping_label` URL.
   - Only the `country` for shipping (omit address, city, etc.).
2. Verify that the order is successfully created in sandbox mode without raising validation errors for missing address fields.

### Test 4: Default Sandbox Validation
1. Ask the agent to create an order WITHOUT specifying whether it is sandbox or production.
2. Check the response to ensure `sandbox: true` was automatically applied.
