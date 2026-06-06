# API Contracts: Knowledge Base

All management endpoints require a valid bearer token AND `role: admin` (global JwtAuthGuard + RolesGuard). Non-admin → 403.

## Admin management (admin only)

### POST `/knowledge`  — create from pasted text OR uploaded `.md`
- **Paste**: `Content-Type: application/json` → `{ title?: string, content: string }`
- **File**: `multipart/form-data` → field `file` = a `.md` file (filename → default title); optional `title`
- Behavior: validate non-empty; generate metadata (summary/keywords/intents/sampleQuestions); save.
- Response `201`: `{ id, title, summary, keywords, intents, sampleQuestions, metadataStatus, createdAt }`
- `400` empty/unsupported/oversize; `403` non-admin.

### GET `/knowledge` — list guides
- Response `200`: `{ guides: [{ id, title, summary, metadataStatus, createdAt }] }` (newest first)

### GET `/knowledge/:id` — full guide (incl. content + metadata)
- `200`: full `KnowledgeDoc`; `404` if missing.

### POST `/knowledge/:id/reprocess` — regenerate metadata
- Re-runs metadata generation on the stored content. `200`: updated metadata.

### DELETE `/knowledge/:id`
- `200`: `{ ok: true }`; the guide is no longer retrievable.

## Agent tool (internal — used by the chat agent every turn)

### `retrieve_knowledge(query: string)`
- Searches the guide metadata index (BM25) for the seller's message.
- Returns:
  ```
  {
    matches: [ { id, title, summary, content } ],   // top 1–2 above the score floor; [] if none relevant
    note: "Use a matching guide to shape your answer; if matches is empty, answer normally."
  }
  ```
- Content is truncated to a bounded length for very long guides.

## System prompt addition
- "At the start of every turn, call `retrieve_knowledge` with the seller's request. If it returns a matching guide, follow that guide (its steps, checks, and follow-up questions). If it returns nothing, answer normally. Never mention guides/tools to the seller."

## Admin promotion (operational, not an end-user API)
- CLI: `node dist/scripts/make-admin.js <email>` → sets that user's `role = 'admin'`.

## Frontend contract
- When `auth.user.role === 'admin'`: show a **Knowledge** panel — paste textarea + `.md` file picker → `POST /knowledge`; list (`GET /knowledge`) with delete (`DELETE /knowledge/:id`) and reprocess. Hidden for non-admins.
