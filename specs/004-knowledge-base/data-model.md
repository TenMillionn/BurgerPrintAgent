# Phase 1 Data Model: Knowledge Base

## KnowledgeDoc  (`knowledgedocs`)
| Field | Type | Notes |
|-------|------|-------|
| _id | ObjectId | PK |
| title | string | required; from the guide or the `.md` filename |
| content | string | required; original Markdown of the guide |
| summary | string | LLM-generated short summary (may be empty if generation failed) |
| keywords | string[] | LLM-generated search keywords |
| intents | string[] | LLM-generated intent labels (e.g. `calculate_profit`) |
| sampleQuestions | string[] | LLM-generated example questions sellers might ask |
| metadataStatus | 'ready' \| 'pending' | `pending` when LLM metadata generation failed → reprocessable |
| createdBy | ObjectId → User | the admin who uploaded it |
| createdAt / updatedAt | Date | auto |

**Validation**
- `title` 1..200; `content` non-empty (reject empty/whitespace → FR-006); reasonable max size for an uploaded `.md`.
- `keywords/intents/sampleQuestions` default to `[]`.
- On create: `metadataStatus = 'ready'` if the LLM returned valid metadata, else `'pending'` with empty arrays (FR-007).

**Lifecycle**
- create (paste or `.md`) → generate metadata → save.
- reprocess → regenerate metadata from current `content`, set `metadataStatus = 'ready'`.
- delete → removed; no longer retrievable.

## Retrieval index (in-memory, MiniSearch / BM25)
Built from all `KnowledgeDoc`s; indexed fields = `title + summary + keywords + intents + sampleQuestions` (NOT `content`). `storeFields: [id]`; Unicode tokenizer; fuzzy + prefix (mirrors `MemoryService.searchHistory`). Query = the seller's message; returns ranked ids → load `title/summary/content` for the top matches above a score floor.

## Relationships
```
User (role: admin) 1───* KnowledgeDoc   (createdBy)
```

## Validation → FR map
- Admin-only management (FR-001) — enforced at the endpoint (RolesGuard), not the schema.
- Both paste + `.md` produce the same doc (FR-003); empty/unsupported rejected (FR-006).
- Metadata generated on ingest (FR-004), stored with content + title (FR-005); failure → `pending`, reprocessable (FR-007, FR-014).
- Index over metadata (FR-009); bounded top-N return (FR-012); delete stops retrieval (FR-013).
