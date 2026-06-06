# Implementation Plan: BurgerPrint Catalog API Data Sync

**Branch**: `002-burgerprint-api-sync` | **Date**: 2026-06-06 | **Spec**: [spec.md](file:///home/letattuan/work/BurgerPrintAgent/specs/002-burgerprint-api-sync/spec.md)

**Input**: Feature specification from `/specs/002-burgerprint-api-sync/spec.md`

## Summary

Implement a new dedicated sync service to fetch data from the BurgerPrint CatalogV2 API. The service exposes a REST endpoint (JWT-protected) and a cron schedule to fetch the catalog list. It uses BullMQ to enqueue an atomic job per product, sequentially fetching product detail, partner support, and shipping info. Data is stored in a normalized 3-collection MongoDB architecture (`products`, `product_variants`, `product_shippings`) to bypass document size limits and support flexible queries.

## Technical Context

**Language/Version**: TypeScript / Node.js (NestJS 10.x)

**Primary Dependencies**: `@nestjs/bullmq`, `bullmq`, `@nestjs/schedule`, `@nestjs/mongoose`, `mongoose`

**Storage**: MongoDB (Mongoose) with 3 collections: `products` (keyed by `shortCode`), `product_variants` (keyed by `baseSku.id`), and `product_shippings`. Redis for BullMQ/caching/locks

**Testing**: Jest (Unit testing)

**Target Platform**: Node.js backend

**Project Type**: NestJS backend service/module

**Performance Goals**: Full catalog sync (~500+ products) under 30 minutes

**Constraints**: Max 3 API retries with exponential backoff, default 5 concurrent BullMQ workers to respect API rate limits.

**Scale/Scope**: ~500+ products, individual JSON responses can be somewhat large (parsing needed).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No project-specific constitution defined. Quality checklist in `checklists/requirements.md` passed.

## Project Structure

### Documentation (this feature)

```text
specs/002-burgerprint-api-sync/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── burgerprints-sync/
│   │   ├── burgerprints-sync.module.ts
│   │   ├── burgerprints-sync.controller.ts
│   │   ├── burgerprints-sync.service.ts
│   │   ├── jobs/
│   │   │   ├── sync.processor.ts
│   │   │   └── sync.producer.ts
```

**Structure Decision**: A new module `burgerprints-sync` will be added to the existing NestJS `backend` application, alongside existing modules, separating this logic from the active agent workflow in `burgerprints`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| BullMQ Integration | To handle per-product sync reliably and concurrently | Simple Promise.all would fail the whole sync on a single API error or trigger rate limits easily |
| 3-Collection Data Model | To support highly detailed catalog data without hitting MongoDB 16MB limits | Storing hundreds of variants and shipping info in a single Product document will cause BSON size errors and complex partial updates |
