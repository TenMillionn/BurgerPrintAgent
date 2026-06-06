# Feature Specification: BurgerPrint Catalog API Data Sync

**Feature Branch**: `002-burgerprint-api-sync`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Triển khai service sync data burger print API với 4 endpoints: Get List (catalogsV2/search), Get Detail (catalogsV2/alias/{alias}), Get Partner Support (catalogsV2/decorations/filter), Get Shipping Info by Partner (catalogsV2/locations)"

## Clarifications

### Session 2026-06-06

- Q: Should this feature modify the existing agent service (`BurgerPrintsService`)? → A: No. Use new dedicated endpoints/service for sync. Do NOT modify the existing agent flow.
- Q: How should the sync be triggered? → A: Expose a REST endpoint for user-triggered sync + cron-based scheduled sync.
- Q: How should detail enrichment (per-shortCode API calls) be processed? → A: Use BullMQ job queue. After fetching the product list, enqueue each product's detail/partner/shipping sync as individual BullMQ jobs for reliable, concurrent processing.
- Q: Should detail/partner/shipping be one BullMQ job or chained separate jobs? → A: Single job per product. One job handles all 3 API calls (detail → partner → shipping) sequentially for atomicity and simplicity.
- Q: Should the sync trigger endpoint require authentication? → A: Yes. Require JWT authentication using the existing auth guard to prevent unauthorized triggers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Full Catalog Sync (Priority: P1)

As a system administrator, I want the system to automatically synchronize the full product catalog from the BurgerPrint CatalogV2 API so that the local database always has up-to-date product information (names, sizes, colors, pricing, decorations, categories, and production metadata).

**Why this priority**: The product catalog is the foundational data set. Without it, no other feature (partner lookup, shipping calculation, order creation) can function. This adds a NEW sync pipeline using CatalogV2 endpoints alongside (not replacing) the existing agent service, providing richer, paginated data.

**Independent Test**: Can be fully tested by triggering a manual sync and verifying that the local `products` collection contains all products returned by the CatalogV2 search endpoint, with correctly transformed fields (e.g., `"1"` → `true` for booleans, `"1-3"` → `{min:1, max:3}` for production time, CSV strings → arrays).

**Acceptance Scenarios**:

1. **Given** the CatalogV2 API is reachable, **When** a full sync is triggered, **Then** all products from the paginated search endpoint are fetched and upserted into the local `products` collection using `shortCode` as the unique key.
2. **Given** a product already exists locally, **When** a sync runs and the upstream data has changed (e.g., new colors, updated pricing), **Then** the local record is updated with the new data while preserving the `syncedAt` timestamp.
3. **Given** the API returns products with `catalogObjects` arrays, **When** the sync processes them, **Then** each product's `categories`, `sellingPlatforms`, `shippingTiers`, `collections`, `fulfillmentLocations`, and `brand` fields are correctly extracted and stored.
4. **Given** the API returns `decorations` as a JSON string, **When** the sync processes it, **Then** `techniques` (e.g., DTG, DTF, Sublimation) and `printAreas` (e.g., Front, Back) are correctly parsed and stored as arrays.

---

### User Story 2 - Product Detail Enrichment via BullMQ (Priority: P1)

As a system administrator, I want the sync service to enqueue BullMQ jobs for each product to fetch detailed information (variants/SKUs, pricing per variant, design templates, size charts, and HTML descriptions) so that detail enrichment is reliable, concurrent, and resumable.

**Why this priority**: The list endpoint provides summary data; the detail endpoint provides variant-level pricing (baseCost, secondSidePrice), SKU structures (baseSku), options (color/size with IDs), printable areas, media, and size charts — all essential for accurate order creation. Using BullMQ ensures individual product failures don't block the entire sync and jobs can be retried independently.

**Independent Test**: Can be tested by syncing a known product (e.g., `EUG2400`) and verifying the local record contains the full detail data including baseSku entries with per-variant pricing and location info.

**Acceptance Scenarios**:

1. **Given** a product with shortCode `EUG2400` exists in the catalog, **When** its BullMQ detail job executes, **Then** the local product record stores `options`, `printable` zones, `media`, `sizeChart`, and `htmlDesc`.
2. **Given** the detail endpoint returns `baseSku` entries with `shippingCostUs`, `baseCost`, and `secondSidePrice`, **When** the BullMQ job processes them, **Then** these variant pricing fields are upserted into a separate `product_variants` collection using `baseSku.id` as the primary key, linked via `productShortCode`.
3. **Given** a product detail is successfully fetched, **When** the job completes, **Then** the `detailFetched` flag is set to `true` and `syncedAt` is updated.
4. **Given** a detail job fails (API error/timeout), **When** BullMQ retries are exhausted, **Then** the job is moved to the failed queue and the product's `detailFetched` remains `false` for the next sync cycle to retry.

---

### User Story 3 - Partner/Factory Support Lookup (Priority: P2)

As a system administrator, I want the sync service to fetch and store partner (factory/location) information for each product and decoration type, so the agent can recommend the best fulfillment partner based on available colors, processing time, shipping carrier, and quality.

**Why this priority**: Partner data determines which factories can produce a given product, what colors they support, and their service levels. This is critical for order routing but depends on having the product catalog (P1) in place first.

**Independent Test**: Can be tested by querying partner data for product `EUG2400` with decoration `DTG` and verifying that partner entries (e.g., Hatta, Rocky) are returned with their supported colors, processing time, shipping carrier, and product services.

**Acceptance Scenarios**:

1. **Given** product `EUG2400` supports DTG decoration, **When** the partner support endpoint is queried with `decoration=DTG&shortCode=EUG2400`, **Then** the system returns a list of partners (locations) with their IDs, names, icons, supported colors, positions, and product services.
2. **Given** a partner has specific color availability, **When** the data is stored, **Then** each partner's supported colors (with id, name, hex value, position) are correctly associated with that partner for that product.
3. **Given** the partner's `value` field contains HTML with structured info (ideal for, tracking, processing time, shipping carrier, printing method, quality), **When** the sync processes it, **Then** these structured details are parsed and stored in a queryable format.

---

### User Story 4 - Shipping Info by Partner (Priority: P2)

As a system administrator, I want the sync service to fetch shipping/location information for a specific product and partner combination, so the agent can provide accurate shipping cost and delivery estimates.

**Why this priority**: Shipping info completes the fulfillment picture. Once we know which partners support a product (P2 Story 3), we need their shipping details for accurate order cost calculation.

**Independent Test**: Can be tested by querying shipping info for `shortCode=EUG2400&partnerId=sJjQMlcq1vayqSbA` and verifying the returned shipping rates and location data.

**Acceptance Scenarios**:

1. **Given** product `EUG2400` and partner ID `sJjQMlcq1vayqSbA`, **When** the shipping locations endpoint is queried, **Then** the system returns shipping details for that specific partner-product combination.
2. **Given** the API returns shipping cost and location data, **When** the data is stored, **Then** it is upserted into a separate `product_shippings` collection linked by `productShortCode` and `partnerId` for future lookups.

---

### User Story 5 - Scheduled & On-Demand Sync (Priority: P2)

As a system administrator, I want the sync to run on a configurable cron schedule and also be triggerable on-demand via an exposed REST endpoint, so the product data stays fresh without manual intervention.

**Why this priority**: Elevated to P2 because the user explicitly requires both a cron schedule and a user-facing trigger endpoint as part of the core feature delivery.

**Independent Test**: Can be tested by (1) calling the exposed trigger endpoint and verifying a sync starts, and (2) configuring a cron schedule, waiting for it to trigger, and verifying sync log shows a successful run.

**Acceptance Scenarios**:

1. **Given** a cron schedule is configured, **When** the scheduled time arrives, **Then** the full sync pipeline (list → enqueue BullMQ detail/partner/shipping jobs) runs automatically.
2. **Given** a REST endpoint is exposed (e.g., `POST /api/burgerprints-sync/trigger`) protected by JWT auth, **When** an authenticated user makes a POST request, **Then** a sync is started and the response includes a job ID or status.
3. **Given** a sync is already running, **When** another sync is triggered, **Then** the second request is rejected with a "sync in progress" status to prevent duplicate work.

---

### Edge Cases

- What happens when the BurgerPrint API returns a 429 (rate limit) or 5xx error during sync? → The sync should implement retry with exponential backoff (max 3 retries per request) and log failures without crashing the entire sync job.
- What happens when a product exists locally but is no longer returned by the catalog API? → The product should be soft-deleted (marked as `inactive`) rather than hard-deleted, to preserve historical order references.
- What happens when the `decorations` field is malformed JSON? → The sync should log a warning, store the raw value in `decorationsRaw`, and skip parsing `techniques`/`printAreas` for that product.
- What happens when the API response structure changes (e.g., new fields or missing fields)? → The sync should handle missing fields gracefully with default values and log schema drift warnings.
- What happens when the CatalogV2 search endpoint returns more than 1000 products in a single page? → The sync should paginate using `pageIndex` incrementally until no more results are returned.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fetch all products from the CatalogV2 search endpoint (`/api/v1/catalogsV2/search?pageSize=1000&pageIndex=N`) using pagination until all products are retrieved.
- **FR-002**: System MUST upsert products into the local `products` collection using `shortCode` as the unique primary key identifier.
- **FR-003**: System MUST transform API response fields to match the existing schema: `stretchableDesign` ("0"/"1" → boolean), `genMockupSupport` ("0"/"1" → boolean), `isNew` ("0"/"1"/null → boolean), `countColors` (string → number), `productionTime` ("1-3" → {min:1, max:3}), `locations` (CSV → string[]), `sizesList` (CSV → string[]), `createdDate` ([year,month,day] → Date).
- **FR-004**: System MUST parse `catalogObjects` arrays to extract: `brand` (from catalogName matching brand patterns), `categories` (e.g., "T-shirts", "Mugs"), `sellingPlatforms` (e.g., "Shopify", "Amazon"), `shippingTiers` (e.g., "Standard", "Express"), `collections` (e.g., "Best Sellers"), and `fulfillmentLocations`.
- **FR-005**: System MUST parse the `decorations` JSON string to extract `techniques` (decoration names like "DTG", "Sublimation Printing") and `printAreas` (decoration keys like "Front", "Back", "Left Sleeve / Right Sleeve").
- **FR-006**: System MUST enqueue a single BullMQ job per product that sequentially fetches: (1) product detail from the CatalogV2 alias endpoint (`/api/v1/catalogsV2/alias/{aliasName}`), (2) partner support from decorations filter, and (3) shipping info from locations endpoint. All 3 calls are atomic within one job. Data fetched MUST be saved into three separate collections: `products` (core info), `product_variants` (using `baseSku.id` as primary key), and `product_shippings`.
- **FR-007**: System MUST fetch partner support data from the decorations filter endpoint (`/api/v1/catalogsV2/decorations/filter?decoration={technique}&shortCode={shortCode}`) for products that have decoration techniques, as part of each product's BullMQ detail job.
- **FR-008**: System MUST fetch shipping/location info from the locations endpoint (`/api/v1/catalogsV2/locations?shortCode={shortCode}&partnerId={partnerId}`) for each product-partner combination, as part of each product's BullMQ detail job.
- **FR-009**: System MUST implement retry logic via BullMQ's built-in retry mechanism (exponential backoff, max 3 attempts) for detail/partner/shipping jobs, plus HTTP-level retry for the list sync.
- **FR-010**: System MUST log sync progress, errors, and summary statistics (products synced, failed, skipped) for each sync run.
- **FR-011**: System MUST expose a REST endpoint (e.g., `POST /api/burgerprints-sync/trigger`) protected by JWT authentication (reusing the existing auth guard) for user-triggered on-demand sync.
- **FR-012**: System MUST support configurable cron-based scheduled sync using `@nestjs/schedule` or BullMQ repeatable jobs.
- **FR-013**: System MUST prevent concurrent sync runs using a distributed lock mechanism (Redis-based).
- **FR-014**: System MUST store raw API responses (`raw`, `catalogObjectsRaw`, `decorationsRaw`) alongside transformed data for debugging and audit purposes.
- **FR-015**: System MUST update `syncedAt` and `detailFetched` metadata fields after each successful sync operation.
- **FR-016**: System MUST NOT modify the existing `BurgerPrintsService` or its agent-facing tools. All sync logic MUST reside in a new, dedicated service/module.
- **FR-017**: System MUST use BullMQ queues backed by the existing Redis connection for all per-product detail enrichment jobs.

### Key Entities

- **Product**: The core catalog entity representing a printable product (e.g., "Unisex Long Sleeve | Gildan 2400"). Contains identification (externalId, shortCode, aliasName), display info (name, mockup, designFormat), attributes (sizes, colors, decorations), pricing (dropshipPriceMin/Max), categorization (brand, categories, techniques), and sync metadata (syncedAt, detailFetched).
- **ProductVariant (baseSku)**: A specific size-color-location combination for a product with its own SKU, base cost, second side price, default profit, and shipping costs. Linked to a Product by shortCode.
- **Partner (Location)**: A fulfillment factory/partner that can produce certain products. Has a name, icon, position/priority, supported colors, and product services (e.g., standard/express processing).
- **CatalogObject**: A classification tag from BurgerPrint (brand, category, shipping tier, selling platform, collection, fulfillment location). Products reference these via arrays.
- **Decoration**: A printing technique (DTG, DTF, Sublimation) with print area definitions (front, back, sleeves) and design guidelines (resolution, file format, color profile).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Full catalog sync completes within 30 minutes for the entire product catalog (currently ~500+ products).
- **SC-002**: 100% of products returned by the search API are present in the local database after a successful sync run.
- **SC-003**: Data transformation accuracy is 100% — all field type conversions (string→boolean, CSV→array, JSON string→parsed object) produce correct results verified by automated tests.
- **SC-004**: The sync service recovers gracefully from API failures, retrying transient errors and completing partial syncs without data corruption.
- **SC-005**: Product detail enrichment covers at least 95% of catalog products (allowing for temporary API failures on individual products).
- **SC-006**: Sync runs do not duplicate data — running the sync multiple times produces the same result (idempotent upserts).
- **SC-007**: The existing product schema and agent functionality remain fully compatible after the migration to CatalogV2 API endpoints.

## Assumptions

- The BurgerPrint CatalogV2 API (`catalog-api.burgerprints.com`) is publicly accessible without authentication for catalog read operations (no `api-key` header needed for CatalogV2, unlike the v1 API).
- The database strategy employs a 3-collection model (`products`, `product_variants`, `product_shippings`) to avoid MongoDB's 16MB document size limit and improve query flexibility, modifying the original single-collection Mongoose schema approach.
- The CatalogV2 API response structure is stable and matches the example JSON files provided.
- Redis is available for caching, distributed locking, and BullMQ queue storage (already used by the existing service).
- BullMQ concurrency will be configured (default 5 concurrent workers) to avoid triggering rate limits on the CatalogV2 API.
- The shipping info endpoint response format will be documented when the example file is populated (currently empty).
- The existing `BurgerPrintsService` and its agent-facing methods will NOT be modified — all sync functionality is built as a separate module/service.
- `@nestjs/bullmq` and `@nestjs/schedule` will be added as new dependencies for queue processing and cron scheduling respectively.
