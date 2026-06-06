# Phase 0 Research: Auth & Conversation Persistence

The stack is fixed (NestJS + Mongoose + Passport/JWT) and most of the feature is already scaffolded, so research is limited to a handful of design decisions. No open NEEDS CLARIFICATION remain.

## D1 — Per-user ownership enforcement
- **Decision**: A reusable check inside `ConversationService`: load the conversation by id, compare `conversation.userId` to `req.user._id`; if mismatch → `NotFoundException` (404, not 403, to avoid leaking existence). Apply to every `:id`/`:sessionId` operation (stream, messages, system-prompt, model, get, rename, delete).
- **Rationale**: Centralized, hard to forget, and 404-on-foreign matches "deny without disclosure" (FR-009, SC-003).
- **Alternatives**: A dedicated `ConversationOwnerGuard` (cleaner per-route, but needs a DB read in the guard and the conversation again in the service → double fetch). Chosen the service-level check for simplicity; can promote to a guard later.

## D2 — Reliable message persistence (vs current fire-and-forget)
- **Decision**: Persist the **seller message synchronously (awaited)** before the agent runs — it must never be lost (FR-018). Persist the **assistant message after the turn completes**, awaited, with a structured error log on failure; on stream error, still save the seller turn and record the failure in `metadata` without writing a corrupt assistant entry.
- **Rationale**: The seller's input is the irreplaceable part; the assistant reply can be regenerated. Awaiting after the stream has finished does not affect real-time delivery (tokens already sent).
- **Alternatives**: Full transactional write of both turns (heavier, needs Mongo transactions / replica set — overkill); keep fire-and-forget (rejected: silent loss violates FR-015/FR-018).

## D3 — Tool-step persistence shape
- **Decision**: Store on the assistant `Message.metadata` as `{ toolSteps: [{ name, order }] }`, captured from the `tool` chunks already streamed by the runtime (collect names in order during the turn). Keep it minimal (name + order), not full payloads (per spec assumption).
- **Rationale**: `metadata` is already `Mixed` (no schema change); minimal shape keeps documents small and is enough to redisplay the timeline (FR-016).
- **Alternatives**: A separate `tool_steps` collection (more joins, unnecessary at this scale); storing full tool results (large, not required).

## D4 — Conversation title derivation
- **Decision**: On the **first** seller message of a conversation still titled the default, set the title to a trimmed/truncated version of that message (e.g., first ~60 chars). Allow manual rename to override.
- **Rationale**: Gives a human-readable list (FR-014) with zero extra cost; manual rename (FR-012) wins.
- **Alternatives**: LLM-generated summary title (extra latency/cost; can be a later enhancement via existing `summary` field).

## D5 — History load & pagination
- **Decision**: `GET /conversations/:id` returns the conversation plus its messages ordered ascending by timestamp. Return all by default for typical sizes; add `limit`/`before` cursor params for very long conversations (bounded load, SC reopen performance).
- **Rationale**: Simple reopen for the common case; cursor keeps worst case responsive without changing the common path.
- **Alternatives**: Always paginate (more FE complexity up front); load via Redis only (rejected: Redis is TTL'd, Mongo is the source of truth on reopen).

## D6 — Google OAuth configuration
- **Decision**: Read client id/secret/callback strictly from env; if missing, **do not register dummy credentials** — log a clear warning and let the Google routes return a configuration error (or omit the strategy) instead of silently "working" with fake values.
- **Rationale**: Dummy fallback hides misconfiguration and can mislead testers; fail-clear is safer.
- **Alternatives**: Hard crash on boot if missing (too strict — email/password should still work without Google configured). Chosen: degrade only the Google route.

## D7 — Frontend conversation list wiring
- **Decision**: `Sidebar.jsx` fetches `GET /conversations` on load/after each new turn; selecting an item calls `GET /conversations/:id` to load history into the chat; rename → `PUT`, delete → `DELETE`; "New chat" creates a conversation lazily on first send and refreshes the list.
- **Rationale**: Matches the existing Sidebar placeholder and the SSE flow; minimal new surface.
- **Alternatives**: Optimistic local-only list (rejected: must reflect persisted truth across devices, SC-002).
