# Phase 0 Research: Knowledge Base

Stack is fixed and most pieces reuse existing infrastructure; research is a few design decisions. No open NEEDS CLARIFICATION.

## D1 — Index metadata, not raw content
- **Decision**: Build the BM25 index over `title + summary + keywords + intents + sampleQuestions`, not the full Markdown. Store full content separately and return it only after a match.
- **Rationale**: Bridges the vocabulary gap (seller phrasing ≠ guide wording) and keeps the index small/clean; matches the user's intent. Raw-content indexing dilutes signal.
- **Alternatives**: Index full content (noisier, worse precision); vector embeddings (overkill at this scale, harder to debug — deferred).

## D2 — Always retrieve, with a relevance floor
- **Decision**: The agent calls `retrieve_knowledge` every turn (per user requirement). The tool returns the top 1–2 guides **only if** their BM25 score clears a small threshold; otherwise it returns an empty result so the agent proceeds normally (FR-011).
- **Rationale**: "Always call" gives consistency; the score floor prevents an irrelevant guide from polluting answers (SC-003).
- **Alternatives**: Server-side auto-inject every turn (less transparent, can't be skipped by the model); agent decides whether to call (violates the "always" requirement).

## D3 — Tool returns guide content for the model to use
- **Decision**: `retrieve_knowledge(query)` returns `{ matches: [{ id, title, summary, content }], note }`. The agent reads `content` and follows it. Content is truncated to a bounded size if very long.
- **Rationale**: The model needs the actual guide steps to apply them (FR-010); bounding keeps context/latency sane (FR-012).
- **Alternatives**: Return only a summary (loses the steps); return many guides (context bloat).

## D4 — LLM metadata generation reliability
- **Decision**: A `KnowledgeAiService` calls the configured OpenAI-compatible `/chat/completions` with a strict instruction to return JSON `{summary, keywords[], intents[], sampleQuestions[]}` (use JSON-mode/`response_format` where supported); validate + coerce; on failure, save the guide with empty metadata and mark it reprocessable (FR-007).
- **Rationale**: Decouples save from enrichment so a transient LLM error never loses content; reprocess fills metadata later.
- **Alternatives**: Block save on metadata success (data loss risk); generate metadata lazily at first retrieval (unpredictable latency).

## D5 — Admin role + promotion
- **Decision**: Reuse `User.role` (`'user' | 'admin'`). Add a `RolesGuard` + `@Roles('admin')` on management endpoints (runs after the global JwtAuthGuard). Promotion via a small CLI script `make-admin.ts <email>` (and a `UsersService.promoteToAdmin`).
- **Rationale**: Minimal, reuses existing auth; CLI avoids manual DB edits (FR-002).
- **Alternatives**: A protected "first admin" bootstrap endpoint (more surface); env-based admin email list (less flexible).

## D6 — Upload: pasted text AND .md file
- **Decision**: One `POST /knowledge` endpoint accepting either `{ title?, content }` JSON (paste) or a multipart `.md` file (`FileInterceptor`); `.md` filename → default title; reject empty/non-text/oversize (FR-006).
- **Rationale**: Single ingestion path → identical stored result (FR-003).
- **Alternatives**: Two separate endpoints (duplication).

## D7 — Index freshness
- **Decision**: Build the MiniSearch index on demand from current guides (corpus small); optionally cache and invalidate on create/delete/reprocess. Start with build-per-retrieval for simplicity; add a cached singleton if needed.
- **Rationale**: Always reflects the latest guides without a sync step; cheap at this scale.
- **Alternatives**: Persistent serialized index (premature; adds invalidation complexity).
