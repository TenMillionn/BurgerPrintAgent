# Contract: Seller API Key Management (`/api/me`)

Backend controller `@Controller('me')` → frontend path `/api/me/...`. All routes require authentication (`JwtAuthGuard` / `ApiAuth`). The key is the seller's own BurgerPrints fulfillment API key.

## PUT /api/me/burgerprints-key

Save (set or replace) the seller's BurgerPrints API key.

- **Body**: `{ "apiKey": "<plaintext key>" }`
- **Behavior**: trim → validate non-empty (and basic shape, e.g. min length) → `cryptoUtil.encrypt(apiKey)` → store in `User.burgerprintsApiKeyEnc`.
- **Response 200**: `{ "configured": true, "last4": "abcd" }`
- **Never** echoes the full key. Never logs it.

### Errors
| Status | code | When |
|---|---|---|
| 400 | `INVALID_KEY` | empty / too short |
| 401 | — | not authenticated |

## DELETE /api/me/burgerprints-key

Clear the stored key.

- **Response 200**: `{ "configured": false }`
- Unsets `burgerprintsApiKeyEnc`.

## GET /api/me/burgerprints-key

Read key status only.

- **Response 200**: `{ "configured": boolean, "last4": string | null }`
- `last4` is derived by decrypting in-memory and slicing the last 4 chars; full key never returned.

## CryptoUtil (`common/crypto.util.ts`)

```
encrypt(plaintext: string): string   // "b64(iv):b64(tag):b64(ct)"
decrypt(payload: string): string     // throws on tamper / wrong key
```

- AES-256-GCM. Derive 32-byte key = `sha256(ENCRYPTION_KEY)`. Random 12-byte IV per call. Auth tag verified on decrypt.

## Env

| Var | Joi |
|---|---|
| `ENCRYPTION_KEY` | string required (min length, e.g. ≥ 16) |

Rotating `ENCRYPTION_KEY` invalidates all stored keys (sellers must re-enter) — documented in quickstart.
