# Implementation Plan: Design Print-File Pipeline

**Branch**: `006-design-file-pipeline` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-design-file-pipeline/spec.md`

## Summary

Add a validated print-file pipeline on top of feature 005: a `request_design_upload` tool renders an in-chat upload card; uploads go to a new `POST /uploads/design` endpoint that stores the file on R2, reads pixel dimensions with `sharp`, and persists a `DesignAsset` (conversation + side + agent-message ref + dimensions + valid flag); a `validate_design` tool checks dimensions against a fixed allowed-resolution list; `process_design` resize/crops invalid images to the closest allowed resolution (cover + center crop) and returns corrected assets; `list_design_assets` lets the seller pick a different image. Ordering resolves the latest valid asset per side. Reuses feature 005's `render_buttons` (for "Process now" and the chooser) and the SSE chunk pattern (new `upload_card` chunk; processed images shown as markdown).

## Technical Context

**Language/Version**: TypeScript (NestJS, ESM) backend; React + Vite frontend.
**Primary Dependencies**: existing — Mongoose, `@aws-sdk/client-s3` (R2), pi-agent-core/pi-ai, multer (`FileInterceptor`). NEW — `sharp` (read dimensions + resize/crop).
**Storage**: MongoDB (new `DesignAsset` collection), Cloudflare R2 (originals + processed images).
**Testing**: Jest (unit for resolution math/validation), manual quickstart for the chat flow.
**Project Type**: Web app (backend + frontend).
**Performance Goals**: upload+validate feels instant; a resize/crop of a single image completes in a few seconds.
**Constraints**: a real order requires a valid front asset (FR-012); no fabricated dimensions/results (FR-014); buttons only on the agent's last message (FR-013, already implemented in 005); R2/secret config from env only.
**Scale/Scope**: 4 new agent tools + 1 reused; 1 new upload endpoint; 1 new chunk type; 1 new Mongo collection; FE upload card component.

## Constitution Check

Constitution file is the unfilled template → gate on project conventions (English everything; Tailwind-first FE; feature branch + PR; strict-verify/no-fabrication; reuse existing patterns). All satisfied — no violations, Complexity Tracking empty.

## Project Structure

```text
specs/006-design-file-pipeline/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/{design-upload-api.md, agent-tools.md}
└── tasks.md   (/speckit-tasks)
```

### Source Code

```text
backend/
├── src/
│   ├── design/                            # NEW module
│   │   ├── design.module.ts
│   │   ├── design.controller.ts           # POST /uploads/design, GET /design/assets
│   │   ├── design-asset.service.ts        # CRUD + latest-per-side + validation/process orchestration
│   │   ├── image-processing.service.ts    # sharp: dimensions, nearest allowed resolution, resize+crop
│   │   ├── allowed-resolutions.ts         # the fixed WxH list + helpers
│   │   └── schemas/design-asset.schema.ts # NEW Mongo schema
│   ├── uploads/r2.service.ts              # REUSE (move to shared or import) — put(buffer,contentType,key)
│   ├── burgerprints/burgerprints-tool.service.ts  # (unchanged for orders; design tools live in design module)
│   └── agent/
│       ├── agent.types.ts                 # MODIFY: + AgentUploadCardChunk ('upload_card')
│       └── pi-agent-core.runtime.ts       # MODIFY: register design tools; push upload_card chunk; resolve design for create_order
└── src/conversation/{conversation,guest}.controller.ts  # MODIFY: SSE-map 'upload_card'

frontend/
└── src/
    ├── components/UploadCard.jsx          # NEW: file picker → POST /uploads/design → loading → success
    └── App.jsx                            # MODIFY: handle 'upload_card' chunk; render UploadCard on last msg; processed images via markdown
```

**Structure Decision**: a dedicated `design/` module isolates the asset store + image processing from the order/agent code. The agent runtime calls the design service through injected providers (like it calls `UserKeyService`). R2 access is reused from feature 005's `R2Service` (exported from its module and imported by the design module).

## Complexity Tracking

No constitution violations — none.
