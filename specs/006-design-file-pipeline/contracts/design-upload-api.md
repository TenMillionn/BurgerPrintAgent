# Contract: Design Upload / Assets API

Backend controller `@Controller()` routes under `design/` + `uploads/design`; FE paths via `/api/*`. Auth required (logged-in seller), like feature 005's `/uploads`.

## POST /api/uploads/design
Upload a print file for a side.
- **Content-Type**: `multipart/form-data`
- **Fields**: `file` (image), `side` (`front`|`back`), `conversationId` (sessionId), `ref` (the upload card ref).
- **Handler**: `FileInterceptor('file')` → validate mime ∈ {png,jpeg,webp} + size ≤ `UPLOAD_MAX_BYTES` → `sharp(buf).metadata()` for width/height (reject if unreadable) → R2 `put` key `designs/<userId>/<uuid>.<ext>` → compute `valid = isAllowed(w,h)` → save `DesignAsset` → respond.

### Response 201
```json
{ "id": "<assetId>", "url": "https://pub-...r2.dev/designs/<userId>/<uuid>.png",
  "side": "front", "width": 4500, "height": 5400, "valid": true }
```
### Errors
| Status | code | When |
|---|---|---|
| 400 | INVALID_FILE_TYPE / FILE_TOO_LARGE / EMPTY_FILE / UNREADABLE_IMAGE | validation |
| 401 | — | not authenticated |
| 502 | UPLOAD_FAILED | R2 put failed |

## GET /api/design/assets?conversationId=...
List a conversation's design assets (newest first).
- **Response 200**: `{ assets: [ { id, side, url, width, height, valid, processed, createdAt } ] }`
- Ownership: only the requesting user's assets for that conversation.

## Notes
- `ref` is stored as `agentMessageRef`. `conversationId` is the chat sessionId.
- Processed assets are created server-side by the process step (not this endpoint) with `processed:true` + `sourceAssetId`.
