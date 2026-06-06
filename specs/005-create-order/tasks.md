---
description: "Task list for feature 005-create-order"
---

# Tasks: Create Order (Order Creation & Management via Chat)

**Input**: Design documents from `/specs/005-create-order/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Tests**: Not requested as a TDD gate. A few targeted integration/manual checks are included where they de-risk money/security paths; full unit-test coverage is optional.

**Organization**: Tasks grouped by user story (US1–US5) after a shared Setup + Foundational phase, so each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (Setup/Foundational/Polish have no story label)
- All paths are repo-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencies + env config + validation scaffolding shared by all stories.

- [X] T001 Add `@aws-sdk/client-s3` to backend dependencies in `backend/package.json` (run `npm i @aws-sdk/client-s3` in `backend/`).
- [X] T002 [P] Add R2 + encryption env vars to `backend/.env` (real values, gitignored): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=burgerprint`, `R2_ENDPOINT`, `R2_PUBLIC_BASE_URL`, `UPLOAD_MAX_BYTES`, `ENCRYPTION_KEY`.
- [X] T003 [P] Mirror the same var NAMES (no values) in `backend/.env.example`.
- [X] T004 Add Joi rules for `R2_*` (account/access/secret/bucket string required; endpoint/public-base uri required), `UPLOAD_MAX_BYTES` (number optional, default 10485760), and `ENCRYPTION_KEY` (string required, min length) in `backend/src/config/env.validation.ts`.
- [X] T005 Expose typed config in `backend/src/config/configuration.ts`: add `r2: { accountId, accessKeyId, secretAccessKey, bucket, endpoint, publicBaseUrl }`, `uploadMaxBytes`, and `encryptionKey`.

**Checkpoint**: app boots with the new env validated; missing vars fail fast.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: shared primitives every story depends on — crypto util, agent context plumbing, the new `action` chunk, and the per-session api-key resolution. No story can be completed before these.

- [X] T006 [P] Create AES-256-GCM util `backend/src/common/crypto.util.ts` with `encrypt(plaintext)→"b64(iv):b64(tag):b64(ct)"` and `decrypt(payload)` (key = `sha256(ENCRYPTION_KEY)`, random 12-byte IV, auth tag verified). Never log inputs.
- [X] T007 Extend `AgentRunInput` in `backend/src/agent/agent.types.ts` with optional `userId?: string` and `isGuest?: boolean`.
- [X] T008 Add `AgentActionChunk` (`type:'action'`, `action:'login_required'|'apikey_required'`, `message?`) to the `AgentChunk` union in `backend/src/agent/agent.types.ts`. (Decision per F4: drop `open_design_upload` from phase 1 — the FE opens the attach control via normal UX, no agent signal needed.)
- [X] T009 Thread auth context into the runtime callers in `backend/src/conversation/conversation.service.ts`: `streamMessage` passes `userId` (from the authenticated session/user), `streamGuest` passes `isGuest:true`. Ensure the `for await` loop forwards `action` chunks unchanged and does NOT persist them to the assistant reply.
- [X] T010 Verify the authenticated chat route supplies the user id end-to-end (controller → `streamMessage`); if `userId` is not currently available there, plumb `req.user._id` through in `backend/src/conversation/conversation.controller.ts` + `conversation.service.ts` (addresses analysis F7).
- [X] T011 Map the `action` chunk to SSE in the streaming endpoints (`backend/src/conversation/conversation.controller.ts` SSE + `backend/src/conversation/guest.controller.ts`) so the FE receives `event: action` (or the existing chunk envelope) alongside token/tool/done.
- [X] T012 In `backend/src/agent/pi-agent-core.runtime.ts` `tool_execution_end` handler: when a tool result `details.requires` ∈ {`login`,`apikey`}, also `push({ type:'action', action: requires==='login'?'login_required':'apikey_required', message })`.
- [X] T013 Add a per-session key resolver in `backend/src/agent/pi-agent-core.runtime.ts`: given `input.userId`, load + decrypt the seller key (via the user-key service); expose a helper the order tools use. No user → signal `requires:'login'`; user without key → `requires:'apikey'`. Also map a provider **401/auth failure** from any seller-key call to `requires:'apikey'` (covers an invalid/revoked key — analysis C2) so the FE re-prompts key setup.
- [X] T014 Make `BurgerPrintToolService` methods accept an optional `apiKey` and fall back to the env shared key, in `backend/src/burgerprints/burgerprints-tool.service.ts` (refactor `createOrder` + add a private `headers(apiKey?)` helper; convert existing Vietnamese logs/strings to English as touched).

**Checkpoint**: runtime can resolve the right key per call and emit `action` chunks; FE receives them. Stories can now proceed.

---

## Phase 3: User Story 3 — Authentication gate before ordering (P1) 🎯 First gate

**Goal**: a guest is blocked from starting an order and prompted to log in; a logged-in seller proceeds.
**Independent test**: as guest, ask to order → login popup, no detail collection; after login, flow starts.

- [X] T015 [US3] Add the `check_auth` tool in `backend/src/agent/pi-agent-core.runtime.ts` `buildTools()`: no params; returns `{logged_in:true}` or `{logged_in:false, requires:'login'}` from `input.userId/isGuest`.
- [X] T016 [US3] Update `defaultSystemPrompt()` in `backend/src/agent/pi-agent-core.runtime.ts`: instruct the agent to call `check_auth` BEFORE collecting any order info; if not logged in, stop and ask the seller to log in (no field/tool names exposed).
- [X] T017 [P] [US3] Add `check_auth` to `AGENT_TOOLS_INFO` in `backend/src/agent/pi-agent-core.runtime.ts`.
- [X] T018 [US3] FE: handle the `action: login_required` SSE event in `frontend/src/App.jsx` (open the existing login modal); ensure the agent's turn pauses gracefully.

**Checkpoint**: guest order attempt is blocked + login prompt shown; backend enforces regardless of FE.

---

## Phase 4: User Story 4 — Configure the seller's own API key (P1)

**Goal**: seller saves/clears their BurgerPrints key (encrypted); status shows configured + last4; key gate prompts when missing.
**Independent test**: logged-in seller without key reaching the real-order step is prompted to settings; after saving, status shows configured/last4; full key never shown.

- [X] T019 [P] [US4] Add `burgerprintsApiKeyEnc?: string` (`@Prop()`, never projected) to `backend/src/users/schemas/user.schema.ts`.
- [X] T020 [US4] Create `backend/src/users/user-key.service.ts`: `setKey(userId, plaintext)` (encrypt + store), `clearKey(userId)`, `getStatus(userId)→{configured,last4}` (decrypt in-memory for last4 only), `getDecryptedKey(userId)→string|null` for internal use by the runtime resolver.
- [X] T021 [US4] Create `backend/src/users/me.controller.ts` (`@Controller('me')`, auth-guarded): `PUT /me/burgerprints-key` (body `{apiKey}` → validate non-empty/min-length → set), `DELETE /me/burgerprints-key` (clear), `GET /me/burgerprints-key` (status). Never log/return plaintext.
- [X] T022 [US4] Wire `UserKeyService` + `me.controller` into the users module (`backend/src/users/*.module.ts`); ensure the runtime resolver (T013) calls `getDecryptedKey`.
- [X] T023 [US4] Add the `require_seller_key` tool in `pi-agent-core.runtime.ts` `buildTools()`: requires `input.userId`; returns `{has_key:true,last4}` / `{has_key:false, requires:'apikey'}` / `{requires:'login'}`; register in `AGENT_TOOLS_INFO`.
- [X] T024 [US4] Update `defaultSystemPrompt()`: at the draft→real boundary call `require_seller_key`; if no key, stop and ask the seller to configure it in settings.
- [X] T025 [P] [US4] FE: Settings key UI in `frontend/src/components/` (Tailwind-first, masked input, shows configured + last4, save/clear) calling `/api/me/burgerprints-key`.
- [X] T026 [US4] FE: handle `action: apikey_required` in `frontend/src/App.jsx` → open the Settings key panel.

**Checkpoint**: seller can manage a key securely; key gate works end-to-end; key never exposed (SC-004).

---

## Phase 5: User Story 2 — Upload a design/mockup image (P1)

**Goal**: seller attaches an image → stored on R2 → public URL attached to the chat turn.
**Independent test**: attach a valid image → `{url}` returned + attached; invalid type/oversize rejected with a clear reason.

- [X] T027 [US2] Create `backend/src/uploads/r2.service.ts`: `S3Client({region:'auto', endpoint:R2_ENDPOINT, credentials})`; `put(buffer, contentType, key)→${R2_PUBLIC_BASE_URL}/${key}` via `PutObjectCommand`; never log credentials.
- [X] T028 [US2] Create `backend/src/uploads/uploads.controller.ts` (`@Controller('uploads')`, auth-guarded) `POST /uploads` with `FileInterceptor('file')` (memory storage): validate mime ∈ {png,jpeg,webp}, non-zero, size ≤ `UPLOAD_MAX_BYTES`; key = `designs/<userId>/<uuid>.<ext>`; return `{url,key,contentType,size}`. Errors: `INVALID_FILE_TYPE`/`FILE_TOO_LARGE`/`EMPTY_FILE` (400), 401, `UPLOAD_FAILED` (502).
- [X] T029 [US2] Create `backend/src/uploads/uploads.module.ts` and register it in the app module.
- [X] T030 [P] [US2] FE: re-enable the disabled attach button (`frontend/src/App.jsx` ~L794); on file pick `POST /api/uploads`, show an upload pill, attach the returned URL into the outgoing message. Tailwind-first.
- [X] T031 [US2] Update `defaultSystemPrompt()` (B2): agent advises file requirements via `get_decorations` before asking for an upload, and must have a valid `design_url_front` before a real order.

**Checkpoint**: design upload works and URLs flow into the agent; invalid files rejected (SC-007).

---

## Phase 6: User Story 1 — Place and pay for a real order (P1) 🎯 MVP core

**Goal**: full gated flow — pick SKU → design → address → draft preview → key gate → gate1 create → gate2 charge.
**Independent test**: logged-in seller with a key completes create + charge for an in-stock SKU; sees order id + paid state; two explicit confirmations enforced.

- [X] T032 [US1] Modify `createOrder` in `backend/src/burgerprints/burgerprints-tool.service.ts`: accept a SINGLE `item` param and map to provider `items:[item]` (F2); add `design_url_back`, `mockup_url_back`, `shipping_label`; set `reference_order_id = agent-<sessionId>-<turn>`.
- [X] T033 [US1] Backend hard-enforcement in `createOrder` for `sandbox:false` (F3): reject when `design_url_front` is missing OR shipping invalid (required fields present, 2-letter `state` when `country==='US'`, valid 2-letter `country`). Return a structured `{error, code, message}` — do not rely on the prompt.
- [X] T033b [US1] Enforce in-stock at order time (analysis C1, FR-017): before a real order, resolve the chosen `catalog_sku` via `getProductVariants` and reject (`{error, code:'OUT_OF_STOCK'}`) if `in_stock===false`, in `backend/src/burgerprints/burgerprints-tool.service.ts` — not prompt-only.
- [X] T034 [US1] Idempotency guard (F1) in `backend/src/agent/pi-agent-core.runtime.ts` (or session state): track that an ordering intent (keyed by `sessionId`+turn) already produced an `order_id`; if so, do not call create again — return the existing order. `reference_order_id` is the secondary layer.
- [X] T035 [US1] Add order tools in `pi-agent-core.runtime.ts` `buildTools()` (all use the seller key via T013): `charge_order` (`POST /order/charge {order_ids}`), `get_balance` (`GET /balance`). Update `create_order` tool schema to single-item + new fields + default `sandbox:true`.
- [X] T036 [US1] Implement service methods in `burgerprints-tool.service.ts`: `chargeOrder(orderIds, apiKey)`, `getBalance(apiKey)` with the existing try/catch + structured-error pattern. On a 401/auth failure, return `{error, requires:'apikey'}` (C2) so the runtime emits `apikey_required`.
- [X] T037 [US1] Update `extractToolResults` in `pi-agent-core.runtime.ts` for `charge_order` (state) and `get_balance` (amount); keep `create_order` summary (sandbox/live + order id).
- [X] T038 [US1] Update `defaultSystemPrompt()` with the full flow + the two-gate rule: always draft (sandbox) first to show base+shipping+total; never auto-chain create→charge; default sandbox=true; before charge call `get_balance` and refuse if insufficient; require explicit seller confirmation at each gate.
- [X] T039 [P] [US1] Add `create_order` (updated), `charge_order`, `get_balance` to `AGENT_TOOLS_INFO`.
- [X] T040 [US1] FE: render the draft cost preview and the two confirmation prompts naturally in chat (no new CSS classes; Tailwind for any new elements) in `frontend/src/App.jsx`.

**Checkpoint**: a real, paid single-item order completes end-to-end (SC-001/002/005/008).

---

## Phase 7: User Story 5 — Look up, track, cancel, delete an order (P2)

**Goal**: post-order management on the seller's account.
**Independent test**: for an existing order id, retrieve status + tracking; cancel/delete with confirmation.

- [X] T041 [P] [US5] Implement `getOrder(id, apiKey)`, `getOrderTracking(id, apiKey)`, `cancelOrder(id, apiKey)`, `deleteOrder(id, apiKey)` in `backend/src/burgerprints/burgerprints-tool.service.ts` (seller key; tracking returns `{tracking:null, note}` when absent; 401 → `{error, requires:'apikey'}` per C2).
- [X] T042 [US5] Register `get_order`, `get_order_tracking`, `cancel_order`, `delete_order` tools in `pi-agent-core.runtime.ts` `buildTools()` + `AGENT_TOOLS_INFO`; add `extractToolResults` summaries.
- [X] T043 [US5] Update `defaultSystemPrompt()`: status/tracking on request; cancel/delete require explicit confirmation; say "tracking not available yet" gracefully.

**Checkpoint**: seller can manage existing orders.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T044 [P] Verify provider response shapes against the sandbox/test store (F6/R6): `POST /order/charge`, `GET /order/{id}/tracking`, `PUT /order/{id}/cancel`, `DELETE /order/{id}`, `GET /balance`, and whether `POST /order` rejects a missing design URL. Adjust tool return shaping + `extractToolResults` to the REAL fields; never surface fabricated fields. Document findings in `specs/005-create-order/research.md`.
- [X] T045 [P] Security pass: grep logs to confirm no api-key/secret is logged; confirm `GET /me/burgerprints-key` returns only `{configured,last4}`; confirm a crafted real-order/charge call without auth/key is refused by the backend (SC-004, FR-003).
- [X] T046 [P] Update `backend/.env.example` + `specs/005-create-order/quickstart.md` if any var/flow changed during implementation.
- [ ] T047 Run the full manual quickstart E2E (guest blocked → login → upload → draft → key prompt → create → charge → manage) and record the result.

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** block everything.
- Story order by priority: **US3** (auth gate) → **US4** (key) → **US2** (upload) → **US1** (order core) → **US5** (manage).
  - US1 depends on US4 (seller key resolver) and US2 (design URL) and the foundational key/action plumbing.
  - US3 is independent once Foundational is done; US2 is independent of US3/US4 (upload just needs auth).
- **Polish (P8)** after the stories it checks (esp. T044 after US1/US5 tool shaping).

## Parallel Opportunities

- Setup: T002/T003 [P]; then T004/T005.
- Foundational: T006 [P] alongside T007/T008 (different files).
- US4: T019 [P] (schema) + T025 [P] (FE) while backend service/controller are built.
- US2: T030 [P] (FE) while R2 service/controller (T027–T029) are built.
- Polish: T044/T045/T046 [P].

## MVP Scope

Minimum demoable order: **Foundational + US3 + US4 + US2 + US1** (auth gate, key, upload, gated create+charge). US5 (manage) and most of Polish are incremental.

## Notes

- Conventions: English everything (convert touched Vietnamese strings); Tailwind-first for new FE; reuse the existing `tool()` registration + SSE chunk patterns.
- Secrets only in `backend/.env`; never commit real R2/encryption values.
- Backend is the source of truth for both gates; FE popups are UX only.
