# Phase 0 Research: Create Order

All decisions below are locked from the design discussion; this file records rationale + what must be verified against the live/sandbox provider during implementation.

## R1 — Object storage for design/mockup images

- **Decision**: Cloudflare R2 via the S3-compatible API using `@aws-sdk/client-s3` `S3Client` + `PutObjectCommand`. Bucket `burgerprint`. Object key prefix `designs/<userId>/<uuid>.<ext>` (auto-creates the "folder" — R2 keys are flat, the prefix is virtual). Public URL = `${R2_PUBLIC_BASE_URL}/${key}`.
- **Rationale**: R2 is S3-compatible, so the mature AWS SDK works unchanged; no egress fees; a public `r2.dev` base gives a directly-usable URL for the fulfillment order (BurgerPrints needs a public image URL). Per-user prefix keeps assets attributable and easy to lifecycle later.
- **Config**: `S3Client({ region: 'auto', endpoint: R2_ENDPOINT, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } })`. `forcePathStyle` not required for R2.
- **Validation**: accept only `image/png|jpeg|webp` (POD artwork); reject others. Max size default 10 MB (env-overridable). Reject zero-byte.
- **Alternatives**: presigned PUT direct-from-browser (rejected for phase 1 — server-side upload is simpler, lets us validate/normalize and keeps creds off the client); storing in MongoDB/GridFS (rejected — not publicly servable to the fulfillment API).
- **Verify**: confirm the `r2.dev` public access is enabled on the bucket and a PutObject'd key is reachable at `${R2_PUBLIC_BASE_URL}/${key}`.
- **Implementation finding (2026-06-07)**: a live smoke test (S3 `PutObjectCommand` against bucket `burgerprint`) returned **403 AccessDenied** with the supplied R2 token; `ListBuckets` also denied. The upload code path is correct and standard — the blocker is the credential: the R2 API token must be granted **Object Read & Write** on the `burgerprint` bucket (the current one appears read-only or scoped elsewhere). Re-issue the token in the Cloudflare R2 dashboard, update `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` in `backend/.env`, then re-run the smoke test before relying on uploads (US2 / T044).

## R2 — Encrypting the per-seller API key

- **Decision**: AES-256-GCM via Node `crypto`. Store `iv:authTag:ciphertext` (base64, colon-joined) in `User.burgerprintsApiKeyEnc`. Key = SHA-256 of `ENCRYPTION_KEY` env (gives a 32-byte key from any-length secret). Random 12-byte IV per encryption.
- **Rationale**: GCM is authenticated (detects tampering); standard library, no extra dep; reversible (we must send the plaintext key to BurgerPrints at call time, so hashing/one-way is not an option).
- **Exposure rules**: decrypt only in memory at the moment of an outbound BurgerPrints call. Never log; status endpoint returns `{ configured, last4 }` where `last4` is the last 4 chars of the *plaintext* (decrypt → slice) — acceptable hint, not the secret.
- **Alternatives**: KMS/secrets manager (overkill for this stage); plaintext column (rejected — FR-006); app-level libsodium (extra dep, no benefit over GCM here).
- **Verify**: `ENCRYPTION_KEY` present at boot (Joi required); rotating it invalidates stored keys (documented in quickstart — sellers re-enter).

## R3 — Auth & key gates surfaced to the frontend

- **Decision**: backend is the source of truth. `AgentRunInput` gains `userId?` (authenticated path) and `isGuest?` (guest path). Two thin tools — `check_auth` and `require_seller_key` — read this context and return a status object to the LLM; when blocked they return `{ requires: 'login' | 'apikey', ... }`. The runtime's `tool_execution_end` detects `requires` in the tool `details` and pushes a new `action` chunk so the frontend can show the right popup. The LLM, seeing the status, pauses and tells the seller what to do.
- **Rationale**: reuses the existing tool → SSE chunk pipeline (no new transport). Backend gating is independent of the FE (FR-003): even if the FE never shows a popup, the money/account tools refuse to act without `userId` + a configured key. The `action` chunk is a UX accelerator, not the gate.
- **Money/account tools also self-guard**: `create_order(sandbox=false)`, `charge_order`, `get_balance`, `get_order`, `get_order_tracking`, `cancel_order`, `delete_order` resolve the seller key by `userId`; missing user → `requires:'login'`, missing key → `requires:'apikey'`. So a crafted request without going through `check_auth` still cannot spend money.
- **Alternatives**: a separate WebSocket/event channel for UI actions (rejected — SSE chunk already flows to the FE); enforcing only in the FE (rejected — insecure).

## R4 — Key resolution per call (shared vs seller key)

- **Decision**: catalog/search/shipping tools and the **sandbox draft** use the platform shared key (`burgerprints.apiKey` env). Real order + charge + balance + order management use the **seller key** (decrypted from `User` by `input.userId`). `burgerprints-tool.service.ts` methods take an optional `apiKey` param and fall back to the env shared key.
- **Rationale**: lets a seller preview cost (draft) before configuring a key (FR-009), while ensuring money/account actions hit the seller's own store/wallet (FR-014).
- **Verify**: a sandbox order created with the shared key is genuinely free / non-charging on the provider.

## R5 — Two-gate create→charge flow & idempotency

- **Decision**: never auto-chain. After the sandbox draft, gate 1 = explicit confirm → `create_order(sandbox=false)`; gate 2 = explicit confirm → `get_balance` then `charge_order`. `reference_order_id` is derived deterministically from `sessionId` + the current turn index (e.g. `agent-<sessionId>-<turn>`), so a re-click/retry of the same intent reuses the same reference and avoids creating a duplicate order.
- **Rationale**: matches the locked decision (FR-011/012/015); deterministic reference is the cheapest idempotency guard given the provider has no idempotency-key header documented.
- **Verify**: whether BurgerPrints dedupes on `reference_order_id`. If it does not, the agent must additionally avoid re-calling create for an intent that already returned an `order_id` (tracked in conversation state). Documented as a verify-item.

## R6 — Provider response shapes (must verify against sandbox)

Documented in [api-specs.md](../../docs/api-specs.md) but with partial response schemas. To verify live/sandbox before relying on fields:

- `POST /order/charge` → `{ state, reason: { code, message, method }, balance }` (sample seen). Confirm success/failure discrimination (e.g. `reason.code === 200`).
- `GET /order/{id}/tracking` → **no documented schema** → return raw `data` + surface only clearly-present fields; treat "no tracking yet" gracefully.
- `PUT /order/{id}/cancel` → `{ code, message, data: { is_success, message } }`.
- `DELETE /order/{id}` → `{ is_success, message }`.
- `GET /balance` → confirm field name/shape (amount + currency).
- `POST /order` (real) → `{ is_success, message, order_id, errors[] }`. Confirm whether a missing/invalid design URL is rejected (informs FR-022 enforcement) and what `errors[]` looks like.

**Action**: run these against the test store with `sandbox` where possible during implementation; adjust `extractToolResults` + tool return shaping to the real fields. Do not fabricate fields in the agent output (Strict-verify convention).

## R7 — Frontend upload + action handling

- **Decision**: re-enable the disabled attach button ([App.jsx ~L794](../../frontend/src/App.jsx)); on file pick → `POST /api/uploads` (multipart) → receive `{ url }` → attach as a pill to the composer and include the URL in the outgoing message so the agent can use it. Parse the new SSE `action` event in the stream reader: `login_required` → open the existing login modal; `apikey_required` → open the settings key panel. (Phase 1 emits only these two actions; an `open_design_upload` signal was considered and dropped — the seller opens the attach control via normal UX.)
- **Rationale**: reuses the existing login modal + SSE reader; Tailwind-first for the new settings input and pills (convention).
- **Alternatives**: drag-drop zone (nice-to-have, defer); inline image preview (defer to a follow-up).
