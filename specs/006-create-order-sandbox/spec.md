# Feature Specification: Create Order with Sandbox Mode

**Feature Branch**: `006-create-order-sandbox`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Triển khai feature tạo đơn hàng sang BurgerPrint với mode sandbox cho developer, có thể để client lựa chọn sandbox|production"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Order with Catalog SKU and Design (Priority: P1)

A seller (via the AI agent or API client) creates a fulfillment order on BurgerPrints by providing shipping details, one or more items identified by `catalog_sku`, and design URLs. The client explicitly chooses **sandbox** or **production** mode before submitting the order.

**Why this priority**: This is the most common order flow — sellers already have a catalog SKU and design files ready. It represents the primary use case for the create-order feature and is the baseline for all other order types.

**Independent Test**: Can be fully tested by submitting a sandbox order with a known valid `catalog_sku`, a design URL, and valid shipping address, then verifying that the BurgerPrints API returns `is_success: true` with an `order_id`.

**Acceptance Scenarios**:

1. **Given** a client with a valid API key and a catalog SKU, **When** the client submits a create-order request with `sandbox: true`, valid shipping details, and at least one item with `catalog_sku`, `design_url_front`, and `quantity`, **Then** the system forwards the request to BurgerPrints API and returns the `order_id` along with a clear `sandbox: true` indicator.
2. **Given** a client submitting a sandbox order, **When** the BurgerPrints API returns `is_success: false` with an `errors` array, **Then** the system surfaces those errors clearly to the client with the original request context.
3. **Given** a client sets `sandbox: false` (production mode), **When** the order is submitted, **Then** the system creates a real fulfillment order on BurgerPrints and returns the order confirmation.
4. **Given** a client omits the `sandbox` field, **When** the order is submitted, **Then** the system defaults to `sandbox: true` to prevent accidental production orders.

---

### User Story 2 - Create Order with Product ID and Variant ID (Priority: P2)

A seller creates an order by referencing an existing product/campaign via `product_id` and `variant_id` instead of a raw catalog SKU. This flow is typical when re-ordering from an existing campaign.

**Why this priority**: This is a secondary but important order path for sellers who have already set up campaigns. It reuses the same shipping and sandbox logic but with a different item identifier.

**Independent Test**: Can be tested by submitting a sandbox order with a valid `product_id` and `variant_id` pair, then verifying the BurgerPrints API returns a successful order response.

**Acceptance Scenarios**:

1. **Given** a client with a valid `product_id` and `variant_id`, **When** the client submits a create-order request with `sandbox: true` and valid shipping details, **Then** the system creates the order on BurgerPrints and returns the `order_id`.
2. **Given** a client provides an invalid `product_id` or `variant_id`, **When** the order is submitted, **Then** the system returns the API error with a clear message explaining the invalid reference.

---

### User Story 3 - Create Order with Shipping Label (Priority: P3)

A seller creates an order with a pre-existing shipping label (PDF/image URL), bypassing BurgerPrints' shipping method selection. Shipping address fields become optional (except `shipping_country`), and the seller provides a `shipping_label` URL.

**Why this priority**: This is a niche use case for advanced sellers who manage their own shipping logistics. It supports a specific business workflow but is not required for MVP.

**Independent Test**: Can be tested by submitting a sandbox order with a `shipping_label` URL, `shipping_country`, and item details, then verifying the order is accepted with label-based fulfillment.

**Acceptance Scenarios**:

1. **Given** a client with a shipping label URL and `shipping_country`, **When** the client submits a create-order request with `sandbox: true`, **Then** the system creates the order and returns the `order_id` with label-based fulfillment.
2. **Given** a client provides a `shipping_label` but omits `shipping_country`, **When** the order is submitted, **Then** the system rejects the request with a validation error indicating that `shipping_country` is required.

---

### Edge Cases

- What happens when the BurgerPrints API is unreachable or returns a timeout?
- How does the system handle an order with zero items or items with `quantity: 0`?
- What happens when a design URL is invalid or returns a 404?
- How does the system handle duplicate `reference_order_id` values?
- What happens when `shipping_state` is missing for a US-destined order?
- How does the system respond to an order with mixed valid and invalid items?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support three order creation flows: (1) catalog SKU + design, (2) product ID + variant ID, (3) shipping label.
- **FR-002**: System MUST accept a `sandbox` boolean field on every order request. When `true`, the order is placed in sandbox mode on BurgerPrints. When `false`, the order is placed in production.
- **FR-003**: System MUST default `sandbox` to `true` when the field is not provided, preventing accidental production orders. Sandbox mode is controlled per-request by the client only; there is no server-side environment override.
- **FR-004**: System MUST validate that at least one item is present in the order request before forwarding to BurgerPrints.
- **FR-005**: System MUST validate required shipping fields (`shipping_name`, `shipping_address1`, `shipping_city`, `shipping_zip`, `shipping_country`) for catalog SKU and product ID flows.
- **FR-006**: System MUST allow the client to select `shipping_method` from: `economy`, `standard`, `express`, or `priority express`. If omitted or invalid, the system uses the default behavior (standard, or cheapest available).
- **FR-007**: System MUST support optional fields: `production_service` (only "Priority"), `additional_service` (only "ProActive Tracking"), `callback_url` for order tracking webhooks.
- **FR-008**: System MUST forward the complete BurgerPrints API response (including `is_success`, `message`, `order_id`, `errors`) back to the client.
- **FR-009**: System MUST handle BurgerPrints API errors gracefully (timeout, 4xx, 5xx) and return structured error responses.
- **FR-010**: For shipping-label orders, system MUST require only `shipping_country` and `shipping_label` URL; other shipping fields are optional.
- **FR-011**: System MUST support `fulfillment_partner` as an optional field to identify the originating platform.
- **FR-012**: System MUST allow the client to provide a `reference_order_id` to correlate BurgerPrints orders with their internal systems.

### Key Entities

- **Order Request**: Represents a single order submission containing shipping details, order mode (sandbox/production), and one or more line items.
- **Line Item (Catalog SKU flow)**: An item identified by `catalog_sku` with design URLs (front, back, sleeve), mockup URLs, quantity, and optional `reference_item_id`.
- **Line Item (Product/Variant flow)**: An item identified by `product_id` and `variant_id` with quantity.
- **Line Item (Shipping Label flow)**: An item identified by `catalog_sku` with design URLs, similar to the catalog flow but associated with a shipping label.
- **Order Response**: The result from BurgerPrints containing success status, order ID, message, and any errors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sellers can submit sandbox orders and receive a valid order ID within 10 seconds.
- **SC-002**: 100% of orders submitted without the `sandbox` field default to sandbox mode (no accidental production orders).
- **SC-003**: All three order flows (catalog SKU, product/variant, shipping label) can be completed end-to-end with correct response handling.
- **SC-004**: Error responses from BurgerPrints are surfaced to the client with sufficient detail to diagnose and fix the issue (error code + message + field-level errors).
- **SC-005**: The system clearly distinguishes sandbox vs. production orders in every response so that the client always knows which mode was used.

## Assumptions

- The existing BurgerPrints API client (`BurgerPrintsService`) and its authentication mechanism (`api-key` header) will be reused for order creation.
- The BurgerPrints API endpoint `POST /v2/order` handles both sandbox and production orders based on the `sandbox` field in the request body.
- Design URLs are assumed to be valid, publicly accessible URLs — the system does not validate their content or accessibility before forwarding to BurgerPrints.
- The `reference_order_id` uniqueness check is the responsibility of the caller; the system passes it through without dedup enforcement.
- Webhook (`callback_url`) handling is out of scope for this feature — the URL is simply forwarded to BurgerPrints, and webhook reception will be addressed in a future feature.
- Order data is NOT persisted locally — the system acts as a pass-through proxy to BurgerPrints API. Local order history/audit trail is out of scope and may be addressed in a future feature.

## Clarifications

### Session 2026-06-06

- Q: How should sandbox mode be controlled — per-request by client, with server override, or environment-level only? → A: Per-request only (Option A). The client's `sandbox` field is always respected with no server-side environment override. Default value is `sandbox = true`.
- Q: Should the system persist order records locally for history/audit/retry? → A: No local persistence (Option A). Fire-and-forget pass-through to BurgerPrints API.
