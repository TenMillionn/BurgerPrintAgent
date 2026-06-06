---
description: "Task list for feature 006-design-file-pipeline"
---

# Tasks: Design Print-File Pipeline

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/. Builds on feature 005.
**Organization**: by user story (US1–US4) after Setup + Foundational.

## Phase 1: Setup
- [X] T001 Add `sharp` to backend deps (`cd backend && npm i sharp`). Note `npm rebuild sharp` for hosts without prebuilt binaries.

## Phase 2: Foundational
- [X] T002 [P] Create `backend/src/design/allowed-resolutions.ts`: the fixed `[w,h]` list + `isAllowed(w,h)` + `nearestAllowed(w,h)` (closest aspect ratio, tie-break least upscale).
- [X] T003 [P] Create `backend/src/design/schemas/design-asset.schema.ts` (`DesignAsset`: conversationId, userId, side, url, key, width, height, valid, processed, sourceAssetId?, agentMessageRef, timestamps).
- [X] T004 Add `AgentUploadCardChunk` (`type:'upload_card'`, side, ref) to the union + `AgentChunkType` in `backend/src/agent/agent.types.ts`.
- [X] T005 SSE-map `upload_card` in `backend/src/conversation/conversation.controller.ts` + `guest.controller.ts` (`toData`).
- [X] T006 Export `R2Service` from the uploads module so the design module can reuse it (`backend/src/uploads/uploads.module.ts`).

## Phase 3: US1 — Upload via in-chat card (P1)
- [X] T007 [US1] `backend/src/design/image-processing.service.ts`: `dimensions(buf)` via `sharp().metadata()`; `resizeCrop(buf, w, h)` via `sharp().resize(w,h,{fit:'cover',position:'centre'})`.
- [X] T008 [US1] `backend/src/design/design-asset.service.ts`: `create(...)`, `findById`, `listByConversation(convId,userId)`, `latestValid(convId,side)`, `latest(convId,side)`.
- [X] T009 [US1] `backend/src/design/design.controller.ts`: `POST /uploads/design` (FileInterceptor, side+conversationId+ref) → validate mime/size → dimensions → R2 put → `valid=isAllowed` → save DesignAsset → return `{id,url,side,width,height,valid}`; `GET /design/assets?conversationId=` (owned, newest first).
- [X] T010 [US1] `backend/src/design/design.module.ts` (imports UploadsModule for R2Service + Mongoose DesignAsset) and register in app module.
- [X] T011 [US1] Runtime tool `request_design_upload(side)` → returns `{render:'upload_card', side, ref:'upload-<sessionId>-<turn>-<side>'}`; in `tool_execution_end` push `upload_card` chunk when `details.render==='upload_card'`. Inject design services into the runtime (via DesignModule export).
- [X] T012 [P] [US1] FE `frontend/src/components/UploadCard.jsx` (Tailwind): file picker → `POST /api/uploads/design` (file, side, conversationId, ref) → loading → success → call `onUploaded(side)`.
- [X] T013 [US1] FE `frontend/src/App.jsx`: handle `upload_card` chunk → attach to message (with side+ref); render `UploadCard` on the agent's LAST message; `onUploaded(side)` → `send('Upload ' + side + ' success')`.
- [X] T014 [P] [US1] i18n EN/VI for upload card (`composer`/new `design` keys) + tool labels (request_design_upload, validate_design, process_design, list_design_assets).

## Phase 4: US2 — Validate resolution (P1)
- [X] T015 [US2] Runtime tool `validate_design(side?, image_id?)` → resolve asset (default latest for side) → `{valid,width,height,side,image_id}`; needs authed user (else `requires:'login'`).
- [X] T016 [US2] `extractToolResults` summary for `validate_design` (valid/invalid + WxH); `AGENT_TOOLS_INFO` entry.
- [X] T017 [US2] System prompt: after upload, call validate_design; if invalid, explain + offer auto resize/crop + render_buttons "Process now".

## Phase 5: US3 — Auto resize/crop (P1)
- [X] T018 [US3] `DesignAssetService.process(assetId)`: load original from R2 (or re-fetch via URL), `nearestAllowed`, `resizeCrop`, put new R2 object, save new DesignAsset (`processed:true`, `sourceAssetId`, valid:true). Support front+back.
- [X] T019 [US3] Runtime tool `process_design(front_image_id?, back_image_id?)` (default latest invalid per side) → `{processed:[{side,image_id,url,width,height}], note?}`.
- [X] T020 [US3] System prompt: on "Process now", call process_design and show each processed image as a markdown image; confirm it's now valid. `extractToolResults` + `AGENT_TOOLS_INFO`.

## Phase 6: US4 — Choose image / ordering integration (P2)
- [X] T021 [US4] Runtime tool `list_design_assets()` → `{assets:[...]}` newest first; `extractToolResults` + `AGENT_TOOLS_INFO`.
- [X] T022 [US4] Modify `create_order` resolution: front (and back if printed) design URL resolved from `latestValid(sessionId, side)`; block real order if no valid front (extend MISSING_DESIGN). Allow the agent to pass an explicit `design_asset_id` override (from the chooser).
- [X] T023 [US4] System prompt: default to latest valid asset; on objection call list_design_assets and offer choices via render_buttons.

## Phase 7: Polish
- [X] T024 [P] Update knowledge `docs/knowledge-samples/order-creation-flow.md` (already revised for the print-file flow — verify wording matches the final tools).
- [ ] T025 [P] Unit test `allowed-resolutions` (isAllowed/nearestAllowed) + a processed-image dimensions check.
- [ ] T026 Run quickstart E2E (upload → validate invalid → Process now → valid → order uses latest → chooser).

## Dependencies
Setup → Foundational → US1 → US2 → US3 → US4 → Polish. US2/US3/US4 depend on US1 (assets exist). MVP = Setup+Foundational+US1+US2+US3.
