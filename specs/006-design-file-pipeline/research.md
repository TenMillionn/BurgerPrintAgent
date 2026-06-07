# Phase 0 Research: Design Print-File Pipeline

## R1 — Reading dimensions + resize/crop: `sharp`
- **Decision**: use `sharp` (libvips). `sharp(buffer).metadata()` → width/height on upload; `sharp(buffer).resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer()` to fix an invalid image to an exact allowed resolution.
- **Rationale**: fast, no external service, widely used, exact-size output with cover+crop. Already have buffers from multer memory storage.
- **Alternatives**: jimp (pure JS, slower), an external image API (network dependency) — rejected.
- **Note**: `sharp` ships prebuilt binaries; if the deploy target lacks them, `npm rebuild sharp` may be needed (document in quickstart).

## R2 — Choosing the target allowed resolution
- **Decision**: pick the allowed (W,H) whose aspect ratio (W/H) is closest to the source aspect ratio; tie-break by smallest total upscale. Then `cover` resize + centre crop to that exact size. This minimises distortion/cropping.
- **Rationale**: cover+crop guarantees the exact pixel size the factory requires while preserving as much of the design as possible; closest-aspect minimises how much is cropped.
- **Alternatives**: pad/letterbox to fit (adds borders — bad for prints); stretch to fit (distorts) — rejected.

## R3 — Validation rule
- **Decision**: an image is valid iff `(width, height)` exactly equals one of the allowed pairs (orientation-sensitive — the list is WxH as given). Store `valid` on the asset at upload time; re-checked after processing.
- **Rationale**: factory accepts only those exact sizes. No tolerance.

## R4 — Upload card → FE, and the "agent message it belongs to"
- **Decision**: `request_design_upload(side)` returns `{ render: 'upload_card', side, ref }` where `ref = upload-<sessionId>-<turnIndex>-<side>`. The runtime pushes an `upload_card` chunk (mirrors the `buttons`/`action` pattern). The FE attaches the card to the current assistant message and, on file pick, POSTs to `/uploads/design` with `side`, `conversationId` (sessionId) and `ref`. The `DesignAsset.agentMessageRef = ref`. Where the assistant turn is persisted (authed), the ref maps 1:1 to that turn; linking the concrete Message `_id` is best-effort and not required for the flow.
- **Rationale**: reuses the established chunk→FE pattern; `ref` is a stable per-turn id that satisfies "which agent message references it" without depending on mid-stream persistence.

## R5 — Showing processed images in chat
- **Decision**: `process_design` returns the processed assets' public URLs; the agent embeds them as markdown images in its reply (the chat already renders markdown). No new chunk for images.
- **Rationale**: simplest; reuses existing markdown rendering. A dedicated image chunk adds surface for no real gain here.

## R6 — Default design selection + chooser
- **Decision**: `DesignAssetService.latestValid(conversationId, side)` returns the newest `valid` asset for the side; `create_order` resolves the front (and back if printed) design URL from it. If the seller objects, `list_design_assets` returns all assets for the conversation (per side, newest first) and the agent offers them via `render_buttons` (message buttons whose value identifies the chosen asset).
- **Rationale**: matches the spec's "latest by default, choose on objection". Keeps selection server-resolved (authoritative) rather than relying on the LLM to remember URLs.

## R7 — Auth + reuse
- **Decision**: `/uploads/design` requires auth (logged-in seller), like feature 005's `/uploads`. Guests get the 005 login gate. R2 writes reuse `R2Service` (now verified working after the bucket token was granted write access).
