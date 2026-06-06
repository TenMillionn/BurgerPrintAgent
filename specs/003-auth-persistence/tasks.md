# Tasks: Auth & Conversation Persistence

**Feature**: `003-auth-persistence` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Format: `[ID] [P?] [Story] Description`
- **[P]** = parallelizable (different files, no incomplete-task dependency)
- **[USx]** = belongs to user story x (P1=US1, P2=US2, P3=US3)
- Paths are repo-relative. Everything in **English** (code, comments, commits).

## Context
Auth (register/login/refresh+rotation/google/logout/lockout) and **async** message persistence already work. This feature **exposes + wires + hardens**. Do NOT rebuild auth or schemas.

---

## Phase 1: Setup

- [X] T001 Confirm baseline builds and runs: `cd backend && npm run build` and `node dist/main.js` boot OK with Mongo+Redis up; record any missing env (`MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_EXPIRES_IN`, optional `GOOGLE_*`) in `.env.example`.
- [X] T002 [P] Re-read existing surfaces to avoid duplication: `backend/src/conversation/conversation.repository.ts` (already has `findActiveConversationsByUser`, `getMessagesByConversation`, `updateConversationTitle`, `saveMessage`) and `backend/src/conversation/conversation.controller.ts` (existing endpoints).

---

## Phase 2: Foundational (blocking prerequisites for all stories)

- [X] T003 Add an ownership guard helper `assertOwnedConversation(conversationId, userId)` in `backend/src/conversation/conversation.service.ts` that loads the conversation and throws `NotFoundException` when missing or `userId` mismatch (404, no existence disclosure). Reused by every `:id`/`:sessionId` operation.
- [X] T004 Thread the authenticated user id into the service: update `ConversationService.streamMessage`, `sendMessage`, `getSystemPrompt/setSystemPrompt`, `getModel/setModel` signatures to receive `userId`, and update `conversation.controller.ts` to pass `req.user._id`. (Foundation for ownership + isolation.)
- [X] T005 Add `deleteConversation(conversationId)` to `backend/src/conversation/conversation.repository.ts` that deletes the conversation **and** all its messages (cascade).

---

## Phase 3: User Story 1 — Secure account & per-user isolation (P1) 🎯 MVP

**Goal**: A seller can register / sign in (email-password + Google), keep a silently-refreshing session, and never access another seller's data.

**Independent test**: Register two sellers; each gets a valid session and can refresh it; seller B gets 404 on seller A's conversation.

- [X] T006 [US1] Enforce ownership on every existing `:sessionId` endpoint by calling `assertOwnedConversation` (T003) inside `streamMessage`, `sendMessage`, `getSystemPrompt/setSystemPrompt`, `getModel/setModel` in `backend/src/conversation/conversation.service.ts`.
- [X] T007 [P] [US1] Harden Google OAuth config in `backend/src/auth/strategies/google.strategy.ts`: read `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` strictly from env; remove the hardcoded dummy fallback; if unset, log a clear warning and make the Google route return a configuration error (keep email/password working).
- [X] T008 [P] [US1] Confirm/return a consistent auth payload: ensure `POST /auth/register|login|refresh` return `{ accessToken, refreshToken, user }` and `GET /auth/me` returns the safe user shape (no `passwordHash`) in `backend/src/auth/auth.controller.ts` / `auth.service.ts`.
- [ ] T009 [US1] e2e: refresh-token rotation + logout revocation in `backend/test/` — a used refresh token is rejected; a logged-out token cannot refresh (SC-006).
- [X] T010 [US1] e2e: cross-user isolation — seller B receives 404 on seller A's `:sessionId`/conversation operations (SC-003).

**Checkpoint**: auth + isolation verifiable independently (quickstart steps 1, 6, 7).

---

## Phase 4: User Story 2 — Conversations saved & managed (P2)

**Goal**: A seller's chats are saved with a meaningful title and timestamps; they can list (newest first), reopen, rename, and delete their conversations.

**Independent test**: Start a chat, reload, see it in the list with auto-title + timestamps; rename and delete persist.

- [X] T011 [US2] Add DTOs in `backend/src/conversation/dto/`: `RenameConversationDto { title: string (1..120) }` and a conversation-list/detail response shape.
- [X] T012 [US2] `ConversationService.listConversations(userId)` → maps `findActiveConversationsByUser` to `{ id, title, createdAt, updatedAt }`, newest-`updatedAt` first, in `backend/src/conversation/conversation.service.ts`.
- [X] T013 [US2] `ConversationService.renameConversation(id, userId, title)` (ownership via T003 + `updateConversationTitle`) and `deleteConversation(id, userId)` (ownership + repo `deleteConversation` T005).
- [X] T014 [US2] Auto-title: when the first seller message is added to a conversation still titled the default, set the title from the trimmed/truncated message (~60 chars) in `conversation.service.ts` (streamMessage path) — FR-014.
- [X] T015 [US2] Bump `updatedAt` whenever a message is added so listing reorders correctly (FR-013) — confirm `saveMessage`/repo touches the parent conversation in `conversation.repository.ts`.
- [X] T016 [US2] Controller endpoints in `backend/src/conversation/conversation.controller.ts`: `GET /conversations` (list), `PUT /conversations/:id` (rename), `DELETE /conversations/:id` (delete) — all `@ApiAuth`, pass `req.user._id`, ownership-checked, Swagger-annotated.
- [X] T017 [P] [US2] Frontend: `frontend/src/components/Sidebar.jsx` — fetch `GET /conversations` on auth, render list (title + relative time), "New chat", select, rename, delete actions; i18n labels in `frontend/src/locales/{en,vi}.js`.
- [X] T018 [US2] Frontend wiring in `frontend/src/App.jsx`: create conversation lazily on first send, refresh the Sidebar list after each turn, handle select/rename/delete callbacks.

**Checkpoint**: conversations list/reopen/rename/delete work and persist (quickstart steps 2, 3, 5).

---

## Phase 5: User Story 3 — Full message history preserved & reloaded (P3)

**Goal**: Every seller + assistant message (with tool steps) is saved in order and reloaded exactly on reopen.

**Independent test**: multi-turn chat with tool steps; reopen → all messages + tool steps in original order.

- [X] T019 [US3] Capture tool steps during a turn: in `backend/src/conversation/conversation.service.ts` `streamMessage`, collect `tool` chunk `{name}` in invocation order into an array for the assistant turn.
- [X] T020 [US3] Reliable persistence in `backend/src/session/session.service.ts` + `conversation.service.ts`: persist the **seller** message awaited BEFORE the agent runs (never lost); persist the **assistant** message awaited AFTER the turn with `metadata.toolSteps` (T019); replace fire-and-forget with awaited save + structured error log (FR-015, FR-016, FR-018).
- [X] T021 [US3] Error-safe turn: on stream error, save the seller message and record `metadata.error` without writing a corrupt/duplicate assistant message (FR-018).
- [X] T022 [US3] `ConversationService.getConversation(id, userId)` → conversation + messages ascending by timestamp, each `{ id, role, content, timestamp, toolSteps?, error? }`; support optional `limit`/`before` cursor; ownership-checked.
- [X] T023 [US3] Controller `GET /conversations/:id` in `conversation.controller.ts` (`@ApiAuth`, ownership, Swagger) returning conversation + ordered messages.
- [X] T024 [P] [US3] Frontend: on selecting a conversation, `GET /conversations/:id`, map messages into the chat (roles + `toolSteps` → timeline) in `frontend/src/App.jsx`.

**Checkpoint**: reopening shows full history incl. tool-step timeline in order (quickstart step 4).

---

## Phase 6: Polish & Cross-Cutting

- [X] T025 [P] Swagger: annotate all new conversation endpoints (request/response/ownership 404) and confirm they appear in `/docs`.
- [ ] T026 [P] Unit tests for `ConversationService` ownership + list/get/rename/delete + auto-title in `backend/test/`.
- [X] T027 Run `specs/003-auth-persistence/quickstart.md` curl flow end-to-end against the running app; fix any gaps.
- [ ] T028 [P] Update `docs/Agent-Implementation.md` (or backend README) with the new conversation/message endpoints + persistence behavior.
- [X] T029 Verify existing tests + build pass; no Vietnamese in new code/comments (English rule).

---

## Dependencies & order
- **Setup (P1 tasks T001–T002)** → **Foundational (T003–T005)** → user stories.
- **US1 (T006–T010)** depends on T003–T004. Delivers MVP (auth + isolation).
- **US2 (T011–T018)** depends on T003–T005; T016 depends on T012–T013; FE (T017–T018) depends on T016.
- **US3 (T019–T024)** depends on T003–T005; T022/T023 reuse ownership; FE (T024) depends on T023 and the Sidebar (T017).
- **Polish (T025–T029)** last.

## Parallel opportunities
- T007, T008 (auth hardening) ∥ each other.
- T017 (Sidebar) ∥ backend T011–T016 until wiring (T018).
- T024 (FE history) ∥ after T023.
- T025, T026, T028 (docs/tests) ∥.

## Suggested MVP
**US1 only** (T001–T010): trustworthy auth + per-user isolation — the foundation everything else builds on. US2 then US3 are incremental, independently demoable slices.

## Summary
- Total tasks: **29** (Setup 2 · Foundational 3 · US1 5 · US2 8 · US3 6 · Polish 5)
- Most are expose/wire/harden — auth core + async persistence already exist.
