# Quickstart: Create Order

## 1. Environment setup

Add to `backend/.env` (real values — file is gitignored). Mirror the NAMES (not values) in `backend/.env.example`.

```bash
# Cloudflare R2 (design/mockup image hosting)
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
R2_BUCKET=burgerprint
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://pub-<hash>.r2.dev
UPLOAD_MAX_BYTES=10485760

# Seller API-key encryption (AES-256-GCM)
ENCRYPTION_KEY=<long random secret>   # rotating this invalidates all stored seller keys
```

Joi (`env.validation.ts`) makes all `R2_*` and `ENCRYPTION_KEY` required → the app refuses to boot if missing.

Install the new dependency:

```bash
cd backend && npm i @aws-sdk/client-s3
```

## 2. Manual end-to-end test (the full gated flow)

### A. Guest is blocked (Gate 0)
1. Open the app **without logging in** (guest mode).
2. Ask: "I want to order 1 black Gildan 5000 size L".
3. **Expect**: the agent calls `check_auth`, the stream emits `action: login_required`, the FE shows the login popup, and the agent asks you to log in. No order details collected.

### B. Login → pick SKU → upload design → address
4. Log in. Ask the same. Agent searches and proposes an in-stock SKU (`get_product_variants`, `in_stock=true`).
5. Agent advises file requirements (`get_decorations`). Click the (now enabled) attach button, upload a PNG/JPG/WebP.
   - **Expect**: `POST /api/uploads` returns `{ url }`; the URL is attached to your message.
6. Provide a shipping address (US: 2-letter state). Agent validates; re-asks if a field is missing/invalid.

### C. Draft preview (Gate before key)
7. Agent calls `create_order(sandbox=true)` with the shared key.
   - **Expect**: a cost preview showing base cost + shipping fee + total. No charge.

### D. Key gate
8. Agent calls `require_seller_key`. If you have NOT configured a key:
   - **Expect**: stream emits `action: apikey_required`, FE opens the settings key panel.
9. In settings, `PUT /api/me/burgerprints-key` with your own BurgerPrints key.
   - **Expect**: `GET` status shows `{ configured: true, last4 }`; the full key is never shown.

### E. Gate 1 — create real order
10. Confirm "place the real order".
    - **Expect**: agent calls `create_order(sandbox=false)` with **your** key → returns `order_id`. Order exists but is **not** charged.

### F. Gate 2 — charge
11. Confirm "pay for the order".
    - **Expect**: agent calls `get_balance` (your wallet). If sufficient → `charge_order([order_id])` → state becomes paid. If insufficient → NOT charged, agent tells you to top up.

### G. Manage
12. Ask for status/tracking → `get_order` / `get_order_tracking`.
13. (Optional) Confirm cancel/delete → `cancel_order` / `delete_order`.

## 3. Security checks to verify

- `grep -ri "<your real key>" logs` → nothing (key never logged).
- `GET /api/me/burgerprints-key` returns only `{ configured, last4 }`.
- Hit `POST /order` real path as a guest / without key via a crafted call → backend refuses (`requires: login|apikey`), proving the gate is backend-enforced, not FE-only.
- A re-clicked confirmation reuses `reference_order_id = agent-<sessionId>-<turn>` → no duplicate order.

## 4. Provider response verification (do during implementation)

Run against the test store and confirm the real shapes of: `POST /order/charge`, `GET /order/{id}/tracking`, `PUT /order/{id}/cancel`, `DELETE /order/{id}`, `GET /balance`, and whether `POST /order` rejects a missing design URL. Adjust tool return shaping + `extractToolResults` to match; never surface fabricated fields.
