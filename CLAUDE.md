<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/002-burgerprint-api-sync/plan.md`

New dedicated module `burgerprints-sync` to fetch data from the BurgerPrint CatalogV2 API.
Uses BullMQ to process per-product sync reliably and concurrently.
JWT protected endpoint for manual triggering + cron schedule.
MongoDB schema extensions to `Product` model.
Spec & artifacts ở `specs/002-burgerprint-api-sync/`.
<!-- SPECKIT END -->
