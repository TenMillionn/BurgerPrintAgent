# Feature Specification: Manual Order UI

**Feature Branch**: `007-manual-order-ui`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Tôi cần UI để tạo order thủ công, khi user muốn tạo đơn với 3 step với 3 step chọn items, điền thông tin shipping information, calculate cost Phân tích UI từ ảnh và tối ưu UI cho plan MVP"

## Clarifications

### Session 2026-06-06
- Q: The 'Save & Pay' button in Step 3 implies payment processing. How should payment be handled for this MVP? → A: Tích hợp thông tin để tạo order và call sang API của burger print mode sandbox.
- Q: How should the fulfillment and shipping costs (e.g., $8.75 production, $5.50 shipping) be calculated in Step 3 for this MVP? → A: Calculate internally via backend based on weight and region lookup tables.
- Q: What is the maximum allowed file size and format for the design upload in Step 1? → A: No strict limit for MVP, any image format.
- Q: What happens if the user navigates backward from Step 3 to Step 1 and changes the base product? → A: Prevent navigating back to Step 1 once Step 2 is completed.
## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add Products Step (Priority: P1)

As a user, I want to select a base product, configure its options (color, size), and upload my design so that I can define what item I want to order.

**Why this priority**: Choosing the product and design is the fundamental first step of creating an order.

**Independent Test**: Can be fully tested by selecting product options and uploading a design file, ensuring the selections are saved to proceed to the next step.

**Acceptance Scenarios**:

1. **Given** I am on the "Create Order" page, **When** I view the first step, **Then** I should see options to select Base Product, Color, and Size.
2. **Given** I have selected product options, **When** I upload a design file, **Then** the file should be attached to the order draft.
3. **Given** I have completed all required fields in step 1, **When** I click "Next", **Then** I should proceed to the Shipping Information step.

---

### User Story 2 - Add Shipping Information (Priority: P1)

As a user, I want to input the customer's shipping details including name, contact, and address so that the order can be delivered correctly.

**Why this priority**: Shipping information is strictly required to fulfill and deliver the order.

**Independent Test**: Can be fully tested by filling out the shipping form and validating that required fields are enforced.

**Acceptance Scenarios**:

1. **Given** I am on the Shipping step, **When** I submit the form without required fields (Name, Country, State, City, Street, Zipcode), **Then** I should see validation error messages.
2. **Given** I have filled in all required shipping information correctly, **When** I click "Next", **Then** I should proceed to the Finalize Order step.

---

### User Story 3 - Finalize Order and Calculate Cost (Priority: P1)

As a user, I want to review my order summary, select a shipping service, and see the total calculated cost so that I can confirm and submit the order.

**Why this priority**: Cost calculation and final review are necessary before submitting a payment or confirming an order.

**Independent Test**: Can be fully tested by reviewing the summary, selecting a shipping method, and verifying the total cost updates accordingly.

**Acceptance Scenarios**:

1. **Given** I am on the Finalize Order step, **When** I view the page, **Then** I should see a summary of the selected product, shipping address, and a breakdown of fulfillment costs.
2. **Given** I am viewing the shipping service options, **When** I select a different shipping method (e.g., Express instead of Standard), **Then** the total cost should update to reflect the new shipping fee.
3. **Given** I am ready to complete the order, **When** I click "Save & Pay", **Then** the order should be finalized and submitted.

### Edge Cases

- How does system handle validation if the selected country does not have states/provinces?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a 3-step wizard interface for manual order creation: (1) Add Products, (2) Add Shipping, (3) Finalize Order.
- **FR-002**: System MUST allow users to select Base Product, Color, and Size in the first step.
- **FR-003**: System MUST allow users to upload a design file for the selected product (any image format, no strict size limit for MVP).
- **FR-004**: System MUST collect customer shipping information including Full Name, Email, Phone, Country, State, City, Street Address, and Zipcode.
- **FR-005**: System MUST validate all required shipping fields before allowing progression to the next step.
- **FR-006**: System MUST display an order summary including product details, shipping info, and a cost breakdown (Production fee, Shipping fee, Total).
- **FR-007**: System MUST allow users to select from available Shipping Services (e.g., Standard, Express). The UI MUST fetch dynamic shipping and fulfillment costs from the backend, which calculates them internally based on weight and region lookup tables.
- **FR-008**: System MUST support navigating back from Step 3 to Step 2 to edit shipping data, but MUST NOT allow navigating back to Step 1 once Step 2 is completed.
- **FR-009**: Upon clicking "Save & Pay", the system MUST assemble the order payload and submit it to the BurgerPrints API in sandbox mode, bypassing actual payment processing.

### Key Entities

- **Order Draft**: Represents the in-progress order containing selected product details, design file references, and shipping information.
- **Product Variant**: Represents the combination of Base Product, Color, and Size.
- **Shipping Address**: Represents the destination details (Country, State, City, Street, Zip).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can successfully complete the manual order creation process from Step 1 to Step 3.
- **SC-002**: The system accurately calculates and displays the total order cost based on the selected product and shipping service.
- **SC-003**: Validation prevents submission of incomplete orders (missing product, design, or shipping info).
- **SC-004**: System successfully submits the formatted order payload to the BurgerPrints Sandbox API upon finalization.

## Assumptions

- Auto-fill address functionality from the original UI is considered out of scope for the MVP to simplify implementation.
- Advanced features like IOSS input, Reference Order ID, and Coupon Codes are omitted from the MVP scope.
- Uploading Mockup files is omitted for MVP, assuming the user only needs to upload the raw Design file for the order.
- The UI will be optimized for standard web browsers (desktop-first for MVP).
