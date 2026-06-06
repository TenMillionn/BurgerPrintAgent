# Data Model: Create Order with Sandbox Mode

## Entities

No new database models are introduced. The system acts as a pass-through proxy to the BurgerPrints API. However, the interface schema (Payload) defines the structure that clients must provide.

### `CreateOrderPayload`
Represents a single order submission.

**Fields**:
- `shipping` (Object):
  - `name` (String): Required unless `shipping_label` is provided.
  - `address1` (String): Required unless `shipping_label` is provided.
  - `address2` (String, Optional)
  - `city` (String): Required unless `shipping_label` is provided.
  - `state` (String, Optional)
  - `zip` (String): Required unless `shipping_label` is provided.
  - `country` (String): Always required.
  - `email` (String, Optional)
  - `phone` (String, Optional)
- `shipping_method` (Enum: `economy`, `standard`, `express`, `priority express`): Optional.
- `production_service` (Enum: `Priority`): Optional.
- `additional_service` (Enum: `ProActive Tracking`): Optional.
- `callback_url` (String, Optional): Webhook URL.
- `shipping_label` (String, Optional): URL to custom shipping label.
- `sandbox` (Boolean): Defaults to `true`.
- `fulfillment_partner` (String, Optional).
- `reference_order_id` (String, Optional): Defaults to auto-generated `agent-${Date.now()}`.
- `items` (Array of `LineItem`): Required. Must have at least 1 item.

### `LineItem`
Represents an item within the order.

**Fields**:
- `catalog_sku` (String, Optional): Required if `product_id` and `variant_id` are absent.
- `product_id` (String, Optional): Required if `catalog_sku` is absent.
- `variant_id` (String, Optional): Required if `catalog_sku` is absent.
- `quantity` (Number): Required.
- `design_url_front`, `design_url_back`, `design_url_sleeve` (String, Optional)
- `mockup_url_front`, `mockup_url_back`, `mockup_url_sleeve` (String, Optional)
- `reference_item_id` (String, Optional)

## Validation Rules
1. `items` array must not be empty.
2. If `shipping_label` is not provided, the fields `shipping.name`, `shipping.address1`, `shipping.city`, `shipping.zip` are required.
3. `shipping.country` is always required.
4. If `sandbox` is undefined, it automatically defaults to `true` to prevent accidental production orders.
