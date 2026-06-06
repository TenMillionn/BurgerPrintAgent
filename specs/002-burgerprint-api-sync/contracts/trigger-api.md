# Contracts: BurgerPrint Sync API

## 1. Trigger Sync Endpoint

**Endpoint**: `POST /api/burgerprints-sync/trigger`

**Authentication**: Required (JWT Bearer Token via existing `JwtAuthGuard`)

**Description**: Triggers a manual sync of the BurgerPrint CatalogV2 API. It first fetches the paginated product list, updates local summary records, and enqueues individual BullMQ jobs to fetch the detail/partner/shipping info for each product.

**Request Body**: None required.

**Response**:

```json
{
  "message": "Sync triggered successfully",
  "jobId": "sync-job-12345",
  "status": "in_progress",
  "productsQueued": 520
}
```

**Errors**:
- `401 Unauthorized`: Invalid or missing JWT token.
- `409 Conflict`: A sync job is already in progress.
- `500 Internal Server Error`: Redis/Queue connection failed.
