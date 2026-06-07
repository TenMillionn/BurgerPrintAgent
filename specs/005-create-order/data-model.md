# Phase 1 Data Model: Create Order

## 1. User — new field (MongoDB, `users/schemas/user.schema.ts`)

| Field | Type | Notes |
|---|---|---|
| `burgerprintsApiKeyEnc` | `string?` (`@Prop()`, optional) | AES-256-GCM ciphertext of the seller's BurgerPrints API key, format `base64(iv):base64(authTag):base64(ciphertext)`. Absent = not configured. **Never** projected to clients. |

- Set/cleared via `user-key.service.ts`. Decrypted only in-memory at outbound-call time.
- Status derivation: `configured = !!burgerprintsApiKeyEnc`; `last4 = decrypt(...).slice(-4)` (only place plaintext is briefly materialized for display, computed server-side, never the full value).

## 2. AgentRunInput — extended (`agent/agent.types.ts`)

| Field | Type | Notes |
|---|---|---|
| `userId?` | `string` | Set on the authenticated chat path (`streamMessage`). Undefined for guests. Drives key resolution + auth gate. |
| `isGuest?` | `boolean` | Set true on the guest path (`streamGuest`). |

## 3. AgentActionChunk — new chunk (`agent/agent.types.ts`)

Added to the `AgentChunk` union and mapped through SSE alongside `token|thinking|tool|error|done`.

```ts
export interface AgentActionChunk {
  type: 'action';
  action: 'login_required' | 'apikey_required';
  message?: string; // optional human hint, e.g. "Please log in to place an order"
}
```

> Phase 1 ships only `login_required` and `apikey_required` (analysis D1/F4). An `open_design_upload` signal was considered and dropped — the FE opens the attach control through normal UX, so no agent-emitted signal is needed.

- Emitted by the runtime in `tool_execution_end` when a tool's `details` contains `{ requires: 'login' | 'apikey' }` (mapped to `login_required` / `apikey_required`).
- `conversation.service.ts` passes it straight through the existing `for await` loop (no persistence — it is a transient UI signal, not part of the assistant reply).

## 4. Tool status objects (LLM-facing, returned by tools)

Gate tools return a compact status the LLM reads to decide whether to continue:

```ts
// check_auth
{ logged_in: boolean, requires?: 'login' }
// require_seller_key
{ has_key: boolean, last4?: string, requires?: 'apikey' }
```

Money/account tools, when blocked, return `{ error: true, requires: 'login' | 'apikey', message }` (same `requires` channel triggers the action chunk).

## 5. Order Draft (ephemeral, not persisted)

Result of `create_order(sandbox=true)` used only for preview; discarded after the seller sees it.

| Field | Source | Notes |
|---|---|---|
| `base_cost` | item amount(s) | per-item base cost |
| `shipping_fee` | provider order data | only available via draft (no rate endpoint) |
| `total` | base + shipping | shown to seller |
| `sandbox` | `true` | marks it as a draft |

## 6. Order (real, lives in BurgerPrints — referenced, not stored locally)

| Field | Type | Notes |
|---|---|---|
| `order_id` | string | returned by `create_order(sandbox=false)` |
| `state` | string | e.g. `queued` / `purchased` (after charge) |
| `item` | object | single item (phase 1): `catalog_sku`, `quantity`, `design_url_front`, `design_url_back?`, `mockup_url_front?`, `mockup_url_back?` |
| `shipping` | object | `name`, `address1`, `address2?`, `city`, `state`, `zip`, `country`, `email?`, `phone?` |
| `reference_order_id` | string | `agent-<sessionId>-<turn>` for idempotency |
| `amounts` | object | `amount`/`sub_amount`/`shipping_fee`/`tax_amount` (from get_order) |

## 7. Uploaded Asset (R2 object)

| Field | Type | Notes |
|---|---|---|
| `key` | string | `designs/<userId>/<uuid>.<ext>` |
| `url` | string | `${R2_PUBLIC_BASE_URL}/${key}` — the public URL attached to the order |
| `contentType` | string | validated `image/png|jpeg|webp` |
| `size` | number | ≤ max (default 10 MB) |

## 8. Validation rules (from requirements)

- **Shipping** (FR-021): `name, address1, city, state, zip, country` required; `state` must be a 2-letter code when `country === 'US'`; `country` a valid 2-letter code; re-ask on missing/invalid.
- **SKU** (FR-017): must be `in_stock` (from `get_product_variants`); block out-of-stock.
- **Design** (FR-022): a valid `design_url_front` required before a real order.
- **Upload** (FR-020): image mime + size only.
- **Single item** (FR-016): `create_order` accepts/enforces exactly one item in phase 1.
