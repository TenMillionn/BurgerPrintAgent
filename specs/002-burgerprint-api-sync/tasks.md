---
description: "Task list for BurgerPrint Catalog API Data Sync feature"
---

# Tasks: BurgerPrint Catalog API Data Sync

**Input**: Design documents from `/specs/002-burgerprint-api-sync/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/trigger-api.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependencies.

- [x] T001 Install `@nestjs/bullmq`, `bullmq`, and `@nestjs/schedule` dependencies via npm in `backend/`
- [x] T002 Register `ScheduleModule.forRoot()` in `backend/src/app.module.ts`
- [x] T003 Register `BullModule.forRoot()` with existing Redis connection string in `backend/src/app.module.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.
**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 [P] Create `Product` Mongoose schema with new CatalogV2 fields in `backend/src/burgerprints-sync/schemas/product.schema.ts`
- [x] T005 [P] Create `ProductVariant` Mongoose schema (keyed by `baseSkuId`) in `backend/src/burgerprints-sync/schemas/product-variant.schema.ts`
- [x] T006 [P] Create `ProductShipping` Mongoose schema (compound key `productShortCode`, `partnerId`, `countryCode`) in `backend/src/burgerprints-sync/schemas/product-shipping.schema.ts`
- [x] T007 Create `BurgerprintsSyncModule` configuring Mongoose schemas and HttpModule in `backend/src/burgerprints-sync/burgerprints-sync.module.ts`
- [x] T008 Import `BurgerprintsSyncModule` into `app.module.ts`

**Checkpoint**: Foundation ready - schemas and module structure exist.

---

## Phase 3: User Story 1 - Full Catalog Sync (Priority: P1) 🎯 MVP

**Goal**: Fetch all products from the CatalogV2 search endpoint and upsert them into the local `products` collection.
**Independent Test**: Trigger the list sync method and verify that all products are saved in MongoDB with correct fields and types.

### Implementation for User Story 1

- [x] T009 [US1] Create `BurgerprintsSyncService` in `backend/src/burgerprints-sync/burgerprints-sync.service.ts`
- [x] T010 [US1] Implement `fetchCatalogList()` method in `BurgerprintsSyncService` to handle pagination (`pageIndex`, `pageSize=1000`)
- [x] T011 [US1] Implement transformation logic for `catalogObjects` (extracting brand, categories, etc.)
- [x] T012 [US1] Implement transformation logic for `decorations` JSON string (extracting techniques, printAreas)
- [x] T013 [US1] Implement upsert logic for `Product` in `BurgerprintsSyncService` using `shortCode` as the unique key

**Checkpoint**: At this point, the core product summary data is successfully synced into the DB.

---

## Phase 4: User Story 2 - Product Detail Enrichment via BullMQ (Priority: P1)

**Goal**: Enqueue BullMQ jobs to fetch detailed info (variants, pricing, options) for each product.
**Independent Test**: Sync a single known product and verify its variants are upserted into the `product_variants` collection.

### Implementation for User Story 2

- [x] T014 [US2] Register a Bull queue (e.g., `burgerprints-sync-queue`) in `BurgerprintsSyncModule`
- [x] T015 [US2] Create `SyncProducer` service in `backend/src/burgerprints-sync/jobs/sync.producer.ts` to enqueue jobs for each `shortCode`
- [x] T016 [US2] Create `SyncProcessor` worker in `backend/src/burgerprints-sync/jobs/sync.processor.ts` (concurrency: 5)
- [x] T017 [US2] Implement API call to `/api/v1/catalogsV2/alias/{alias}` inside the processor
- [x] T018 [US2] Implement update logic for `Product` to store `options`, `printable`, `media`, `sizeChart`, `htmlDesc`
- [x] T019 [US2] Implement upsert logic for `ProductVariant` using `baseSku` entries from the detail response
- [x] T020 [US2] Call `SyncProducer` from `BurgerprintsSyncService` after the list sync finishes
- [x] T021 [US2] Update `detailFetched` and `syncedAt` in `Product` upon successful job completion or handle BullMQ retry/failures

**Checkpoint**: At this point, variants and product details are fully populated.

---

## Phase 5: User Story 3 - Partner/Factory Support Lookup (Priority: P2)

**Goal**: Fetch and store partner support information for each product based on its decoration techniques.
**Independent Test**: Query partner data for a specific product/decoration and verify it is updated in the `Product` document.

### Implementation for User Story 3

- [x] T022 [US3] Extend `SyncProcessor` to check if product has `techniques` from `decorations`
- [x] T023 [US3] Implement API call to `/api/v1/catalogsV2/decorations/filter` inside the processor
- [x] T024 [US3] Parse the HTML `value` field from partner info (ideal for, processing time, etc.)
- [x] T025 [US3] Update `Product` document by pushing into the `partnerSupport` array field

**Checkpoint**: Partner support data is now attached to products.

---

## Phase 6: User Story 4 - Shipping Info by Partner (Priority: P2)

**Goal**: Fetch shipping rates for specific product and partner combinations.
**Independent Test**: Verify `product_shippings` collection is populated with correct costs per zone.

### Implementation for User Story 4

- [x] T026 [US4] Extend `SyncProcessor` to loop over fetched `partnerId`s
- [x] T027 [US4] Implement API call to `/api/v1/catalogsV2/locations` inside the processor
- [x] T028 [US4] Implement upsert logic for `ProductShipping` parsing shipping costs, delivery times, and carriers

**Checkpoint**: Complete data pipeline (List -> Detail -> Partner -> Shipping) is functioning within the atomic BullMQ job.

---

## Phase 7: User Story 5 - Scheduled & On-Demand Sync (Priority: P2)

**Goal**: Trigger sync via a REST endpoint and cron schedule.
**Independent Test**: Send a POST request with JWT and verify the queue starts processing.

### Implementation for User Story 5

- [x] T029 [US5] Create `BurgerprintsSyncController` in `backend/src/burgerprints-sync/burgerprints-sync.controller.ts`
- [x] T030 [US5] Implement `POST /api/burgerprints-sync/trigger` endpoint with `JwtAuthGuard` protection
- [x] T031 [US5] Implement distributed lock (e.g., using Redis) in `BurgerprintsSyncService` to prevent concurrent syncs
- [x] T032 [US5] Implement `@Cron` decorator in `BurgerprintsSyncService` for scheduled execution (e.g., daily at 2AM)

**Checkpoint**: Feature is now fully accessible by admins and runs automatically.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [x] T033 [P] Configure BullMQ retry options (exponential backoff, 3 attempts) in job configuration
- [x] T034 [P] Add Winston/Logger logs for summary statistics (success, failure, skipped counts)
- [x] T035 [P] Handle soft-deletion of products/variants that no longer exist in the upstream API
- [x] T036 Update `README.md` to include instructions for the new sync feature and queue architecture

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: Must be done first to install packages.
- **Foundational (Phase 2)**: Schemas must be defined before any service logic can be written.
- **US1 (Phase 3)**: Requires schemas. Sets up the main loop.
- **US2, US3, US4 (Phases 4, 5, 6)**: Builds the BullMQ processor incrementally. Must be done sequentially as each step relies on the previous API's data (Detail -> Partner -> Shipping).
- **US5 (Phase 7)**: Can be done any time after Phase 3, wraps the service with a controller and cron.

## Implementation Strategy

### Incremental Delivery

1. Setup Database schemas and BullMQ config.
2. Build the basic list sync (US1) and verify DB population.
3. Add BullMQ processor to fetch details (US2) and variants.
4. Add partner fetch step to processor (US3).
5. Add shipping fetch step to processor (US4).
6. Wrap with Controller and Cron (US5) to finish the feature.
