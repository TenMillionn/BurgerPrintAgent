# Quickstart: Design Print-File Pipeline

## 1. Setup
```bash
cd backend && npm i sharp
# If the deploy host lacks prebuilt binaries: npm rebuild sharp
```
Reuses feature 005 env (R2_*, ENCRYPTION_KEY, UPLOAD_MAX_BYTES). No new env vars.

## 2. Manual end-to-end
1. Log in. Start an order that needs a front design.
   - **Expect**: agent calls `request_design_upload` → an **upload card** appears (not a text request).
2. On the card, pick a PNG/JPG/WebP and upload.
   - **Expect**: loading → success; chat posts "Upload front success". A `DesignAsset` is stored with conversationId + side=front + agentMessageRef + width/height.
3. Agent calls `validate_design`.
   - Upload a 4500x5400 image → **valid**.
   - Upload a 1000x1000 image → **invalid**: agent says the size isn't a valid print resolution, offers auto resize/crop, shows a **"Process now"** button.
4. Click "Process now" (sends "Process now") → agent calls `process_design`.
   - **Expect**: a corrected image at an allowed resolution is shown in chat (markdown image) and stored (`processed:true`, `sourceAssetId` set); re-validating it returns valid.
5. Place the order.
   - **Expect**: the **most recent valid** front image is used. Say "that's not the right one" → agent calls `list_design_assets` and offers the conversation's images to pick.
6. Try to place a real order with no valid front file.
   - **Expect**: blocked (MISSING_DESIGN), agent asks to upload/fix first.

## 3. Checks
- `GET /api/design/assets?conversationId=<sid>` returns the conversation's assets (newest first), each with side + dimensions + valid/processed.
- Non-image / oversized / unreadable upload → 400 with a clear code, no asset stored.
- A processed image's width/height exactly match an allowed pair.
