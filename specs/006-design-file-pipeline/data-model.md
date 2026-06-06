# Phase 1 Data Model: Design Print-File Pipeline

## 1. DesignAsset (MongoDB — `design/schemas/design-asset.schema.ts`)

| Field | Type | Notes |
|---|---|---|
| `conversationId` | string (indexed) | the chat session this asset belongs to |
| `userId` | string | uploader (authed seller) |
| `side` | `'front' \| 'back'` | which print side |
| `url` | string | public R2 URL |
| `key` | string | R2 object key (`designs/<userId>/<uuid>.<ext>`) |
| `width` | number | pixels |
| `height` | number | pixels |
| `valid` | boolean | dimensions match an allowed resolution |
| `processed` | boolean | produced by resize/crop (default false) |
| `sourceAssetId` | string? | the original asset this was processed from |
| `agentMessageRef` | string | `upload-<sessionId>-<turn>-<side>` — the agent turn the upload card was attached to |
| `createdAt` | Date | timestamps |

Queries: `latestValid(conversationId, side)` = newest `valid:true` for side; `listByConversation(conversationId)` = all, newest first, grouped by side.

## 2. AgentUploadCardChunk (`agent/agent.types.ts`)

Added to `AgentChunk` union + `AgentChunkType`.

```ts
export interface AgentUploadCardChunk {
  type: 'upload_card';
  side: 'front' | 'back';
  ref: string; // upload-<sessionId>-<turn>-<side>
}
```

Emitted by the runtime when `request_design_upload`'s tool result is `{ render: 'upload_card', side, ref }`.

## 3. Tool result shapes (LLM-facing)

```ts
// request_design_upload(side) → triggers the card
{ render: 'upload_card', side, ref }

// validate_design(side?, image_id?)
{ valid: boolean, width, height, side, image_id, allowed_example?: string }
// invalid → agent offers Process now (render_buttons)

// process_design(front_image_id?, back_image_id?)
{ processed: [ { side, image_id, url, width, height } ], note?: string }

// list_design_assets()
{ assets: [ { image_id, side, url, width, height, valid, processed, created_at } ] }
```

## 4. Allowed resolutions (`design/allowed-resolutions.ts`)

Fixed list of `[w, h]` pairs (see spec "Allowed print resolutions"). Helpers: `isAllowed(w,h)`, `nearestAllowed(w,h)` (closest aspect ratio, tie-break least upscale).

## 5. Validation rules
- Upload: image mime (png/jpeg/webp) + size ≤ limit (reuse 005's `UPLOAD_MAX_BYTES`); dimensions must be readable.
- `valid` = exact match in allowed list (orientation-sensitive).
- Order: `create_order(sandbox=false)` resolves front design from `latestValid(conversationId,'front')`; if none → block (extends feature 005's MISSING_DESIGN).
