# Contract: Agent Tools — Design Pipeline

Registered in `pi-agent-core.runtime.ts` `buildTools()`. Design tools call `DesignAssetService` / `ImageProcessingService` (injected into the runtime). All operate on the current `input.sessionId`; uploads/assets require an authed user (else `requires:'login'`, reusing feature 005's gate + action chunk).

### request_design_upload
- **Purpose**: render an in-chat upload card. Call this WHENEVER a print file is needed — never just ask in text.
- **Params**: `side` (`front`|`back`).
- **Returns**: `{ render: 'upload_card', side, ref }` → runtime pushes an `upload_card` chunk. The FE shows the card; on success it auto-sends "Upload front success" / "Upload back success".

### validate_design
- **Purpose**: check an uploaded image's resolution against the allowed list.
- **Params**: `side?` (`front`|`back`, default the side's latest), `image_id?` (default latest for the side).
- **Returns**: `{ valid, width, height, side, image_id }`. If `valid:false`, the agent tells the seller the size is invalid, proposes auto resize/crop, and calls `render_buttons` with a "Process now" button.

### process_design
- **Purpose**: resize/crop invalid image(s) to a valid allowed resolution.
- **Params**: `front_image_id?`, `back_image_id?` (at least one; default latest invalid per side).
- **Returns**: `{ processed: [ { side, image_id, url, width, height } ], note? }`. The agent shows each processed image in chat as a markdown image and confirms it is now a valid print size.

### list_design_assets
- **Purpose**: list this conversation's uploaded images so the seller can pick a different one.
- **Params**: none.
- **Returns**: `{ assets: [ { image_id, side, url, width, height, valid, processed, created_at } ] }` (newest first). The agent presents them (e.g. via render_buttons) for selection.

## Ordering integration (modifies feature 005 create_order)
- When placing a real order, resolve the front (and back if printed) design URL from `DesignAssetService.latestValid(sessionId, side)`.
- If the seller says the default is wrong → `list_design_assets` → let them choose; the chosen asset's URL is used.
- Block the real order if there is no valid front asset (extends 005's `MISSING_DESIGN`).

## Runtime wiring
- `tool_execution_end`: detect `details.render === 'upload_card'` → `push({ type:'upload_card', side, ref })`. (`render === 'buttons'` and `requires` handling already exist from 005.)
- `extractToolResults`: brief summaries for validate_design (valid/invalid), process_design (count), list_design_assets (count).
- `defaultSystemPrompt`: Step 2 of the order flow uses request_design_upload → validate_design → (if invalid) Process now → process_design; ordering uses the latest valid asset, chooser on objection.
- `AGENT_TOOLS_INFO`: add the 4 tools.
