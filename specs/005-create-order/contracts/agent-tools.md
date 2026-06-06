# Contract: Agent Tools (Order lifecycle + gates)

All tools registered in `pi-agent-core.runtime.ts` `buildTools()` using the existing `tool(name, description, properties, required, run)` helper. Order/account tools call `burgerprints-tool.service.ts` methods that take an optional `apiKey` (fallback = env shared key). Key resolution: money/account tools resolve the **seller key** via `input.userId`; sandbox draft + catalog use the **shared key**.

Service base: `baseUrl = https://api.burgerprints.com/v2`, header `api-key`. (Endpoints below are relative to `baseUrl`.)

## Gate tools

### check_auth
- **Params**: none.
- **Logic**: read `input.userId`/`input.isGuest`. Logged in → `{ logged_in: true }`. Else → `{ logged_in: false, requires: 'login' }` (runtime pushes `action: login_required`).
- **Agent use**: call BEFORE collecting any order info (Gate 0). If `logged_in:false`, stop and ask the seller to log in.

### require_seller_key
- **Params**: none.
- **Logic**: requires `input.userId`. No user → `{ requires: 'login' }`. User without key → `{ has_key: false, requires: 'apikey' }` (runtime pushes `action: apikey_required`). With key → `{ has_key: true, last4 }`.
- **Agent use**: call at the draft→real boundary (Key gate). If `has_key:false`, stop and ask the seller to configure their key in settings.

## Order lifecycle tools

### create_order (MODIFIED)
- **Endpoint**: `POST /order`
- **Params**:
  - `shipping`: `{ name, address1, address2?, city, state, zip, country, email?, phone? }` (required: name, address1, city, state, zip, country)
  - `item`: single object `{ catalog_sku, quantity, design_url_front, design_url_back?, mockup_url_front?, mockup_url_back? }` (phase 1 = one item; `design_url_front` required for real orders)
  - `shipping_label?`: string (optional URL)
  - `sandbox?`: boolean (default **true**)
- **Key**: sandbox → shared key; `sandbox:false` → **seller key** (missing → `{ requires:'apikey' }`; no user → `{ requires:'login' }`).
- **Idempotency**: `reference_order_id = agent-<sessionId>-<turn>`.
- **Returns**: `{ sandbox, result: { is_success, message, order_id, errors[] } }` or `{ error, code, message, detail }`.
- **Agent rules**: only call after seller confirms SKU + qty + design + address. `sandbox:false` only after explicit gate-1 confirmation.

### charge_order
- **Endpoint**: `POST /order/charge`, body `{ order_ids: [order_id] }`
- **Key**: seller key (required).
- **Returns**: `{ state, reason: { code, message, method }, balance }` (verify shape) or error.
- **Agent rules**: gate 2 only; never auto-call after create. Call `get_balance` first; if insufficient, do NOT charge.

### get_balance
- **Endpoint**: `GET /balance`
- **Key**: seller key (required).
- **Returns**: balance amount + currency (verify field names).

### get_order
- **Endpoint**: `GET /order/{id}`
- **Key**: seller key (required).
- **Returns**: `{ state, fulfillment, currency, shipping_method, seller{amount,shipping_fee,tax_amount,...}, shipping{address}, items[] }` (compacted).

### get_order_tracking
- **Endpoint**: `GET /order/{id}/tracking`
- **Key**: seller key (required).
- **Returns**: raw tracking `data`; if empty/absent → `{ tracking: null, note: 'not available yet' }`. (Schema undocumented — surface only present fields.)

### cancel_order
- **Endpoint**: `PUT /order/{id}/cancel`
- **Key**: seller key (required).
- **Returns**: `{ is_success, message }` (from `data`). Requires explicit seller confirmation.

### delete_order
- **Endpoint**: `DELETE /order/{id}`
- **Key**: seller key (required).
- **Returns**: `{ is_success, message }`. Requires explicit seller confirmation.

## Runtime wiring changes

- `tool_execution_end`: if `details.requires` ∈ {`login`,`apikey`} → also `push({ type:'action', action: details.requires==='login'?'login_required':'apikey_required', message })`. (Phase 1 actions are only `login_required`/`apikey_required` — `open_design_upload` was dropped, see data-model.md.)
- `extractToolResults`: add compact summaries for `create_order` (already present), `charge_order` (state), `get_order` (state + total), `get_balance` (amount), `get_order_tracking` (carrier/number or "pending"), `cancel_order`/`delete_order` (ok/fail).
- `defaultSystemPrompt`: add the create-order flow (Gate0 auth → SKU → design → address → DRAFT → key gate → gate1 create → gate2 charge → manage), the two-gate rule (never auto-chain, default sandbox=true), and guest/missing-key handling (when a tool returns `requires`, stop and tell the seller the next step without exposing tool/field names).
- `AGENT_TOOLS_INFO`: add the 8 new tools for the FE prompt editor.

## Tool → key matrix

| Tool | Key |
|---|---|
| search_products, compare_factories, get_product_variants, get_shipping, get_*detail/colors/decorations, create_order(sandbox=true draft) | shared (env) |
| check_auth, require_seller_key | n/a (reads input context) |
| create_order(sandbox=false), charge_order, get_balance, get_order, get_order_tracking, cancel_order, delete_order | seller key (by userId) |
