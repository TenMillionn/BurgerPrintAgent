# Tasks: Create Order with Sandbox Mode

**Input**: Design documents from `/specs/006-create-order-sandbox/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

*(No setup tasks needed as this feature extends an existing NestJS service)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 [P] Extract or expand `createOrder` payload type in `backend/src/burgerprints/burgerprints.service.ts` to include all optional fields per the data model contract.
- [x] T002 [P] Extract or expand `createOrder` payload type in `backend/src/burgerprints/burgerprints-tool.service.ts` to include all optional fields per the data model contract.

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Create Order with Catalog SKU and Design (Priority: P1) 🎯 MVP

**Goal**: A seller creates a fulfillment order on BurgerPrints by providing shipping details, items identified by `catalog_sku`, and design URLs with a sandbox mode toggle.

**Independent Test**: Submit a sandbox order with a known valid `catalog_sku`, a design URL, and valid shipping address, then verify that the API returns `is_success: true` with an `order_id`.

### Implementation for User Story 1

- [x] T003 [P] [US1] Update `createOrder` mapping logic in `backend/src/burgerprints/burgerprints.service.ts` to default `sandbox` to `true` and map catalog SKU fields.
- [x] T004 [P] [US1] Update `createOrder` mapping logic in `backend/src/burgerprints/burgerprints-tool.service.ts` to default `sandbox` to `true` and map catalog SKU fields.

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Create Order with Product ID and Variant ID (Priority: P2)

**Goal**: A seller creates an order by referencing an existing product/campaign via `product_id` and `variant_id`.

**Independent Test**: Submit a sandbox order with a valid `product_id` and `variant_id` pair, then verify the API returns a successful order response.

### Implementation for User Story 2

- [x] T005 [P] [US2] Update `createOrder` mapping logic in `backend/src/burgerprints/burgerprints.service.ts` to selectively include `product_id` and `variant_id` when present.
- [x] T006 [P] [US2] Update `createOrder` mapping logic in `backend/src/burgerprints/burgerprints-tool.service.ts` to selectively include `product_id` and `variant_id` when present.

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Create Order with Shipping Label (Priority: P3)

**Goal**: A seller creates an order with a pre-existing shipping label, bypassing BurgerPrints' shipping method selection.

**Independent Test**: Submit a sandbox order with a `shipping_label` URL, `shipping_country`, and item details, then verify the order is accepted with label-based fulfillment.

### Implementation for User Story 3

- [x] T007 [P] [US3] Update `createOrder` mapping logic in `backend/src/burgerprints/burgerprints.service.ts` to handle optional shipping address fields and map `shipping_label`.
- [x] T008 [P] [US3] Update `createOrder` mapping logic in `backend/src/burgerprints/burgerprints-tool.service.ts` to handle optional shipping address fields and map `shipping_label`.

**Checkpoint**: All user stories should now be independently functional

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T009 [P] Map remaining top-level optional fields (`shipping_method`, `production_service`, `additional_service`, `callback_url`, `fulfillment_partner`) in `backend/src/burgerprints/burgerprints.service.ts`.
- [x] T010 [P] Map remaining top-level optional fields in `backend/src/burgerprints/burgerprints-tool.service.ts`.
- [x] T011 Validate all flows via `quickstart.md` procedures using the agent or curl.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: N/A
- **Foundational (Phase 2)**: Starts immediately - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - Proceed sequentially in priority order (US1 → US2 → US3) since they modify the same service methods.
- **Polish (Final Phase)**: Depends on all user stories being complete

### Parallel Opportunities

- Within each phase, modifying `burgerprints.service.ts` and `burgerprints-tool.service.ts` can theoretically be done in parallel, though usually done by a single developer sequentially.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (Type definitions)
2. Complete Phase 3: User Story 1 (Catalog SKU + Sandbox default)
3. **STOP and VALIDATE**: Test User Story 1 independently
4. Deploy/demo if ready

### Incremental Delivery

1. Complete Foundational → Types ready
2. Add User Story 1 (Catalog SKU) → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 (Product/Variant) → Test independently → Deploy/Demo
4. Add User Story 3 (Shipping Label) → Test independently → Deploy/Demo
5. Complete Polish Phase (Extra fields & validation)
