# Contract: Uploads API (Cloudflare R2)

Backend controller `@Controller('uploads')` → frontend-facing path `/api/uploads` (vite proxy strips `/api`). Requires authentication (reuse `JwtAuthGuard` / the project's `ApiAuth` decorator).

## POST /api/uploads

Upload a design/mockup image and get back a public URL.

- **Auth**: required (logged-in seller). Guests are rejected (401).
- **Content-Type**: `multipart/form-data`
- **Body**: field `file` (the image). Optional field `kind` = `design` | `mockup` (default `design`) — only affects the key prefix.
- **Handler**: `FileInterceptor('file')` (memory storage) → validate mime ∈ {`image/png`,`image/jpeg`,`image/webp`} and size ≤ `UPLOAD_MAX_BYTES` (default 10 MB), non-zero → `R2Service.put(buffer, contentType, key)` where `key = designs/<userId>/<uuid>.<ext>` → return public URL.

### Response 201

```json
{ "url": "https://pub-6da5...r2.dev/designs/<userId>/<uuid>.png", "key": "designs/<userId>/<uuid>.png", "contentType": "image/png", "size": 234112 }
```

### Errors

| Status | code | When |
|---|---|---|
| 400 | `INVALID_FILE_TYPE` | mime not an allowed image |
| 400 | `FILE_TOO_LARGE` | size > limit |
| 400 | `EMPTY_FILE` | zero-byte / missing file |
| 401 | — | not authenticated |
| 502 | `UPLOAD_FAILED` | R2 PutObject failed |

## R2Service

```
put(body: Buffer, contentType: string, key: string): Promise<string /* public url */>
```

- `S3Client({ region: 'auto', endpoint: R2_ENDPOINT, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } })`
- `PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType })`
- returns `${R2_PUBLIC_BASE_URL}/${key}`
- never logs credentials.

## Env vars (values only in `backend/.env`, gitignored; documented names in `.env.example`)

| Var | Example / value | Joi |
|---|---|---|
| `R2_ACCOUNT_ID` | (account id) | string required |
| `R2_ACCESS_KEY_ID` | (access key) | string required |
| `R2_SECRET_ACCESS_KEY` | (secret) | string required |
| `R2_BUCKET` | `burgerprint` | string required |
| `R2_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | uri required |
| `R2_PUBLIC_BASE_URL` | `https://pub-....r2.dev` | uri required |
| `UPLOAD_MAX_BYTES` | `10485760` | number optional (default 10MB) |
