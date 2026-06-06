---
description: "Task list for Manual Order UI feature implementation"
---

# Tasks: Manual Order UI

**Input**: Design documents from `/specs/007-manual-order-ui/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api.ts

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create `ManualOrderWizard` directory structure in `frontend/src/components/ManualOrderWizard/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

- [x] T002 Update routing in `frontend/src/App.tsx` (or similar router file) to add `/orders/create` route
- [x] T003 Ensure `burgerprints` API keys are available in backend `.env`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Backend API (Priority: P1) 🎯 MVP

**Goal**: Implement the cost calculation and order creation endpoints in the NestJS backend to support the manual order wizard.

**Independent Test**: Use Postman/cURL to successfully calculate costs and create an order in sandbox mode.

### Implementation for User Story 1

- [x] T004 [P] [US1] Create `CreateManualOrderDto` in `backend/src/orders/dto/create-manual-order.dto.ts`
- [x] T005 [P] [US1] Create `CalculateCostDto` in `backend/src/orders/dto/calculate-cost.dto.ts`
- [x] T006 [US1] Implement cost calculation logic in `backend/src/orders/orders.service.ts`
- [x] T007 [US1] Update `BurgerprintsToolService` in `backend/src/burgerprints/burgerprints-tool.service.ts` to support Sandbox mode API submission
- [x] T008 [US1] Implement `/calculate-cost` and `/create` endpoints in `backend/src/orders/orders.controller.ts`
- [x] T009 [US1] Add validation and error handling to the new endpoints

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently via API clients.

---

## Phase 4: User Story 2 - Frontend 3-Step Wizard (Priority: P1)

**Goal**: Implement the user interface for creating a manual order through a 3-step wizard (Products, Shipping, Finalize).

**Independent Test**: Navigate through the wizard in the browser, fill out all fields, and successfully submit the order.

### Implementation for User Story 2

- [x] T010 [P] [US2] Add API client functions to `frontend/src/services/api.ts` based on `contracts/api.ts`
- [x] T011 [P] [US2] Implement Step 1 (Products & Design) component in `frontend/src/components/ManualOrderWizard/Step1Products.tsx`
- [x] T012 [P] [US2] Implement Step 2 (Shipping) component in `frontend/src/components/ManualOrderWizard/Step2Shipping.tsx`
- [x] T013 [P] [US2] Implement Step 3 (Finalize & Summary) component in `frontend/src/components/ManualOrderWizard/Step3Finalize.tsx`
- [x] T014 [US2] Create wizard container and state management in `frontend/src/pages/CreateOrderPage.tsx` (depends on T011-T013)
- [x] T015 [US2] Integrate API calls (T010) into the wizard submission flow in `frontend/src/pages/CreateOrderPage.tsx`

**Checkpoint**: User Stories 1 AND 2 should both work independently and integrate together for a full E2E flow.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T016 [P] Update UI to match any specific design aesthetics or Tailwind constraints
- [x] T017 [P] Add loading, empty, and error feedback states
- [x] T018 Run testing on field validation (email format, required fields, etc.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion
- **User Stories**:
  - US1 (Backend API) and US2 (Frontend UI) can be developed in parallel as long as API contracts are respected.
  - Final integration testing requires both US1 and US2 to be completed.

### Parallel Opportunities

- DTO creation (T004, T005) can run in parallel.
- Frontend step components (T011, T012, T013) can be developed in parallel.
- US1 (Backend) and US2 (Frontend) can be done simultaneously by different team members.

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and 2 (Setup and Foundational).
2. Complete Phase 3 (US1 - Backend API) and verify with Postman.
3. Complete Phase 4 (US2 - Frontend Wizard) using mocked responses if US1 is not ready, then integrate.
4. **STOP and VALIDATE**: Verify end-to-end flow.
