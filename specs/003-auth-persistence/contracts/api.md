# API Contracts: Auth & Conversation Persistence

Base path: backend root (proxied as `/api` by nginx/Vite). All conversation/message endpoints require `Authorization: Bearer <accessToken>` and are scoped to the authenticated seller.

## Auth (already implemented — documented for completeness)

| Method | Path | Auth | Body / Notes | Response |
|--------|------|------|--------------|----------|
| POST | `/auth/register` | public | `{ email, password, displayName? }` | `{ accessToken, refreshToken, user }` |
| POST | `/auth/login` | public | `{ email, password }` | `{ accessToken, refreshToken, user }` (generic 401 on bad creds) |
| POST | `/auth/refresh` | public | `{ refreshToken }` | `{ accessToken, refreshToken }` (old refresh revoked) |
| POST | `/auth/logout` | bearer | `{ refreshToken }` | `{ ok: true }` (token revoked) |
| GET | `/auth/me` | bearer | — | `{ id, email, displayName, role, ... }` |
| GET | `/auth/google` | public | — | 302 → Google consent |
| GET | `/auth/google/callback` | public | — | issues tokens (redirect/JSON) |

Errors: 401 invalid/expired credentials; 409 email already registered; 401 used/revoked/expired refresh token.

## Conversations (NEW — to build)

### GET `/conversations`
List the current seller's conversations, newest-updated first.
- Response `200`: `{ conversations: [{ id, title, createdAt, updatedAt }] }`

### GET `/conversations/:id`
Get one conversation + its full message history (ordering ascending).
- Response `200`: `{ id, title, createdAt, updatedAt, messages: [{ id, role, content, timestamp, toolSteps?: [{name, order}], error? }] }`
- `404` if not found OR not owned by the seller (no existence disclosure).
- Optional query: `limit`, `before` (cursor) for very long histories.

### PUT `/conversations/:id`
Rename a conversation.
- Body: `{ title: string }` (1..120 chars)
- Response `200`: `{ id, title, updatedAt }`
- `404` if not owned.

### DELETE `/conversations/:id`
Delete a conversation and all its messages.
- Response `200`: `{ ok: true }`
- `404` if not owned.

### POST `/conversations`  (exists — unchanged)
Create a new conversation for the seller. Response `{ sessionId }`.

## Chat (exists — persistence wired underneath, behavior unchanged)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/conversations/:sessionId/stream?message=` | SSE stream; **now** persists seller msg (before run) + assistant msg + toolSteps (after run); ownership-checked |
| POST | `/conversations/:sessionId/messages` | non-stream fallback; same persistence + ownership |
| GET/PUT | `/conversations/:sessionId/system-prompt` | exists; ownership-checked |
| GET/PUT | `/conversations/:sessionId/model` | exists; ownership-checked |

## Ownership & errors (cross-cutting)
- Any `:id` / `:sessionId` not owned by `req.user._id` → **404** (deny without disclosure) — applies to stream, messages, get, rename, delete, system-prompt, model.
- Missing/invalid bearer token → **401** (global `JwtAuthGuard`).
- Validation failures (empty title, bad body) → **400** with class-validator messages.

## Frontend contract (Sidebar + App)
- On auth: `GET /conversations` → render list (title + relative time).
- Select item → `GET /conversations/:id` → load `messages` into chat (roles + toolSteps for timeline).
- New chat → `POST /conversations` (lazy on first send) → prepend to list.
- Rename → `PUT /conversations/:id`; Delete → `DELETE /conversations/:id`; refresh list after each.
