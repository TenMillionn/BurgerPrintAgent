# Research: BurgerPrint Catalog API Data Sync

## BullMQ Integration

- **Decision**: Use `@nestjs/bullmq` with `bullmq` and Redis.
- **Rationale**: Provides robust queueing, exponential backoff retries, concurrency control (e.g. 5 concurrent workers), and separation of the main HTTP process from heavy API polling.
- **Alternatives considered**: Simple `Promise.all` mapping (rejected due to memory and rate limit issues), standard `@nestjs/bull` (older library, `bullmq` is recommended for modern TS apps).

## Cron Scheduling

- **Decision**: Use `@nestjs/schedule` to run a daily or configurable cron job that triggers the queueing process.
- **Rationale**: Built-in NestJS solution, lightweight, directly calls the sync service method.
- **Alternatives considered**: External cron jobs hitting the REST endpoint, BullMQ repeatable jobs.

## Mongoose Schema Update

- **Decision**: Extend existing `burger-print-product.schema.ts` with CatalogV2 fields (`baseSku`, `options`, `printable`, `sizeChart`, `htmlDesc`, `partnerSupport`, etc.). Soft-delete functionality should be ensured.
- **Rationale**: Preserves relationships with existing agent code, keeps catalog info centralized.
- **Alternatives considered**: Creating a new `products_v2` collection. Rejected per user requirement to not modify existing agent flow but upgrade the data backing it.
