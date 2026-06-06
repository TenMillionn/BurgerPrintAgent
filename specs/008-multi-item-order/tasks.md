# Tasks: Multi Item Order Schema & UI

**Input**: Design documents from `/specs/008-multi-item-order/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Verify project structure per implementation plan

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Implement `GET /products` in `backend/src/orders/orders.controller.ts` calling `searchProducts`
- [x] T003 [P] Implement `GET /products/:shortCode/factories` in `backend/src/orders/orders.controller.ts` calling `compareFactories`
- [x] T004 [P] Implement `GET /products/:shortCode/variants` in `backend/src/orders/orders.controller.ts` calling `getProductVariants`
- [x] T005 [P] Implement `GET /products/:shortCode/detail` in `backend/src/orders/orders.controller.ts` calling `getProductDetail_card`
- [x] T006 Add fetch wrappers for these 4 catalog endpoints in `frontend/src/services/api.js`
- [x] T007 Refactor `frontend/src/components/ManualOrderWizard/OrderContext.jsx` to use an `items` array for state management instead of a single item object

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Chat-to-Component Handoff (Priority: P1) 🎯 MVP

**Goal**: Seamlessly pass context from chat (product, partner, variant) to pre-fill the order creation component.

**Independent Test**: Trigger the order component with predefined product and partner properties, verify the component initializes with these values selected.

### Implementation for User Story 1

- [x] T008 [US1] Update `frontend/src/components/Sidebar.jsx` (or chat component) to pass initial `product`, `partner`, and `variant` context to `WizardLayout`.
- [x] T009 [US1] Update `frontend/src/components/ManualOrderWizard/OrderContext.jsx` to initialize the first item with the passed context.
- [x] T010 [US1] Ensure `ItemsStep.jsx` in `frontend/src/components/ManualOrderWizard/ItemsStep.jsx` reads the initial state and triggers subsequent data fetches automatically.

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Dynamic Product & Partner Selection Flow (Priority: P1)

**Goal**: Dynamic fetching and rendering of products, partners, colors, and sizes based on user selections.

**Independent Test**: Select a product, choose Partner A, note available colors/sizes, switch to Partner B and verify variants update via API call.

### Implementation for User Story 2

- [x] T011 [US2] Update `frontend/src/components/ManualOrderWizard/ItemsStep.jsx` to fetch and render the product catalog list on mount using the new API.
- [x] T012 [US2] Update `ItemsStep.jsx` to fetch and display the list of fulfillment partners when a product is selected.
- [x] T013 [US2] Update `ItemsStep.jsx` to fetch variants when a partner is selected and render sizes and circular color swatches using `color_hex`.

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Multi-Item Order Building (Priority: P2)

**Goal**: Support adding multiple distinct items to the single order payload from within the UI.

**Independent Test**: Open component, configure first item, click "Add Another Item", configure second item, and verify both are in the final array.

### Implementation for User Story 3

- [x] T014 [US3] Add an "Add Another Item" button in `frontend/src/components/ManualOrderWizard/ItemsStep.jsx` that appends a new empty item to the `OrderContext` array.
- [x] T015 [US3] Update UI in `ItemsStep.jsx` to allow iterating or switching between multiple configured items (e.g. accordion or tab view).
- [x] T016 [US3] Update payload mapping in `WizardLayout.jsx` or `ReviewStep.jsx` to ensure all `items` are included in the final `CreateOrderPayload` submission.

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: User Story 4 - Design Area Configuration (Priority: P2)

**Goal**: Dynamic rendering of design input areas based on product details, using the selected garment color for preview backgrounds.

**Independent Test**: Select a product with multiple print areas, verify raw URL inputs appear for each area, select a color, and ensure preview background updates to that color.

### Implementation for User Story 4

- [x] T017 [US4] Update `frontend/src/components/ManualOrderWizard/ItemsStep.jsx` to fetch product detail on selection and dynamically render `mockup_url` and `design_url` raw text inputs for each of the `product.printAreas`.
- [x] T018 [US4] Update the design preview container in `ItemsStep.jsx` to apply the selected variant's `color_hex` as its background color.

**Checkpoint**: All 4 User Stories are implemented.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T019 [P] Update `walkthrough.md` with the new multi-item wizard flow details.
- [x] T020 Run end-to-end payload validation (dry-run creation) to verify nested items pass `class-validator` rules in NestJS.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories can then proceed sequentially (US1 → US2 → US3 → US4) or in parallel.
- **Polish (Final Phase)**: Depends on all user stories being complete.

### Implementation Strategy

#### MVP First
1. Complete Phase 1 & 2.
2. Complete Phase 3 & 4 (Handoff and Dynamic Selection).
3. Test the basic single-item end-to-end flow.

#### Incremental Delivery
1. Once MVP works, add Phase 5 (Multi-item) to expand functionality.
2. Finally, add Phase 6 (Design Area dynamic rendering and colors).
