# Feature Specification: Multi Item Order Schema & UI

**Feature Branch**: `[008-multi-item-order]`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "UC: khi user hỏi chat và chọn được sản phẩm, xưởng, variant(optional) -> pass thông tin sang component để fill sẵn data đã được chọn + list product load từ backend: load full list product, + sau khi có thông tin product, hiển thị list partner, + hiển thị color grid color, size + sau khi chọn partner: call api xuống server để lấy những color, size (biến thể mà xưởng đó support) + với thông tin design: lấy vị trí in từ product.printAreas, mỗi area có link mockup_url, design_url + sử dụng color_hex được chọn để fill background cho ảnh design"

## Clarifications

### Session 2026-06-07
- Q: How should the design and mockup images be handled in the UI? → A: Raw URL text inputs: Users just paste existing image URLs.
- Q: How does a user build an order with multiple items using this new chat handoff flow? → A: Add directly in UI: The component opens with the chat's item, but has an "Add Another Item" button to add more inside the UI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chat-to-Component Handoff (Priority: P1)

When a user interacts with the chatbot and decides on a product, fulfillment facility (partner), and optionally a variant, this context must seamlessly pass into the order creation component to pre-fill the form.

**Why this priority**: Eliminates repetitive data entry, ensuring a smooth transition from conversation to actual order creation.

**Independent Test**: Can be tested by triggering the order component with predefined product and partner properties, verifying that the component initializes with these values already selected.

**Acceptance Scenarios**:

1. **Given** the user selects a product in the chat, **When** they click "Create Order", **Then** the product dropdown is pre-filled.
2. **Given** the chat passes a specific partner, **When** the component opens, **Then** the facility dropdown is pre-filled and available colors/sizes are automatically fetched and displayed.

---

### User Story 2 - Dynamic Product & Partner Selection Flow (Priority: P1)

Users need to select products from a full catalog. Upon selecting a product, they choose a fulfillment partner. Selecting a partner triggers a backend call to retrieve the specific colors and sizes supported by that partner for the chosen product.

**Why this priority**: Accurate variant selection depends on both the product and the specific fulfillment facility chosen.

**Independent Test**: Can be tested by selecting a product, choosing Partner A, noting the available colors/sizes, then switching to Partner B and verifying that the colors/sizes update via an API call.

**Acceptance Scenarios**:

1. **Given** the product list is loaded, **When** the user selects a product, **Then** a list of available fulfillment partners is displayed.
2. **Given** a selected product, **When** the user selects a partner, **Then** the system calls the API and populates the color grid and size list with supported variants.
3. **Given** the color grid is populated, **When** it renders, **Then** it displays circular swatches using the variant's `color_hex`.

---

### User Story 3 - Multi-Item Order Building (Priority: P2)

Users must be able to add multiple distinct items into the single order payload from within the UI, after the initial item is passed from the chat.

**Why this priority**: Supports bulk/multi-item ordering without requiring multiple checkout flows.

**Independent Test**: Can be tested by opening the component, filling out the first item, clicking "Add Another Item", configuring the second item, and verifying both are in the final payload array.

**Acceptance Scenarios**:

1. **Given** an active order component, **When** the user clicks "Add Another Item", **Then** a new empty item block appears allowing independent configuration of product, partner, and variants.
2. **Given** multiple configured items, **When** the order is submitted, **Then** all items are grouped into the single `CreateOrderPayload` array.

---

### User Story 4 - Design Area Configuration (Priority: P2)

Users must upload or link design and mockup URLs for specific print areas defined by the product. The UI should use the selected garment color (`color_hex`) as the background for these design previews.

**Why this priority**: Proper print placement and visualization are critical for custom apparel orders.

**Independent Test**: Can be tested by selecting a product with multiple print areas (e.g., front, back), verifying UI slots appear for each, selecting a red color, and ensuring the preview background turns red.

**Acceptance Scenarios**:

1. **Given** a selected product, **When** the design section renders, **Then** it displays upload/input slots for each area found in `product.printAreas` (e.g., `mockup_url`, `design_url`).
2. **Given** the user has selected a color, **When** they view the design preview areas, **Then** the background color of the preview matches the selected `color_hex`.

---

### Edge Cases

- What happens if the chat context passes a product or partner that no longer exists or is out of stock?
- How does the system handle an API failure when fetching the supported variants for a selected partner?
- What if a product has no defined `printAreas`?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The frontend component MUST accept initial properties (product, partner, variant) and pre-fill its state accordingly.
- **FR-002**: The system MUST load the full list of products from the backend on initialization.
- **FR-003**: Selecting a product MUST reveal the list of available fulfillment partners.
- **FR-004**: Selecting a fulfillment partner MUST trigger a backend API call to fetch the specific colors and sizes supported by that partner for the selected product.
- **FR-005**: The UI MUST render available colors as a visual grid using `color_hex` values.
- **FR-006**: The design section MUST dynamically render input areas based on the `product.printAreas` data.
- **FR-007**: Each print area MUST allow the user to provide a `mockup_url` and a `design_url` via raw URL text inputs (no file upload required for MVP).
- **FR-008**: The design/mockup preview areas MUST use the currently selected `color_hex` as their background color.
- **FR-009**: The UI MUST provide an "Add Another Item" button to allow users to configure and append additional items to the order payload from within the same wizard.

### Key Entities

- **Product**: Contains basic info, a list of available partners, and `printAreas`.
- **Partner (Fulfillment Facility)**: A facility that prints the product.
- **Variant**: A specific combination of color (`color_hex`) and size supported by a partner.
- **Print Area**: A specific location on the product (e.g., front, back, left sleeve) requiring design files.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Chat-to-component handoff successfully pre-fills data in 100% of cases where valid data is provided.
- **SC-002**: Variant (color/size) fetching upon partner selection completes in under 500ms.
- **SC-003**: The final generated payload matches the `CreateOrderPayload` schema exactly, including all selected `printAreas` data.

## Assumptions

- The chat interface has a mechanism to invoke this component and pass the selected entities.
- The backend API to fetch variants by partner (`GET /products/:id/partners/:partnerId/variants` or similar) exists or will be created.
- The `product.printAreas` data structure is standardized and provided by the product list API.
