# Implementation Plan: Create Order (Order Creation & Management via Chat)

**Branch**: `005-create-order` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-create-order/spec.md`

## Summary

Let a logged-in seller place and pay for a single-item BurgerPrints fulfillment order entirely through chat, with two explicit confirmation gates (create, then charge) and a sandbox draft to preview cost. The work adds: (1) an image upload service to Cloudflare R2 so design/mockup artwork becomes public URLs; (2) per-seller BurgerPrints API key management (encrypted at rest) so real orders run on the seller's own account/wallet; (3) auth + key gates surfaced to the frontend via a new streaming `action` event; and (4) the order lifecycle tools (create/charge/balance/get/tracking/cancel/delete) wired into the existing pi-agent-core agent runtime. Everything reuses the existing tool-registration + SSE streaming patterns.

## Technical Context

**Language/Version**: TypeScript (Node.js, ESM) backend; JavaScript (React 18 + Vite) frontend

**Primary Dependencies**: NestJS, Mongoose (MongoDB), Redis (ioredis), `@earendil-works/pi-agent-core` (agent runtime behind `AGENT_RUNTIME` port), `@nestjs/axios`/axios (BurgerPrints API v2 client), `@nestjs/platform-express` + multer (`FileInterceptor`), `@aws-sdk/client-s3` (NEW — R2 is S3-compatible), Node `crypto` (AES-256-GCM), Joi (env validation). Frontend: React, Tailwind (utility-first, theme via CSS vars).

**Storage**: MongoDB (User doc gains an encrypted key field; conversations/orders metadata unchanged), Redis (sessions/streaming), Cloudflare R2 bucket `burgerprint` (design/mockup images). Real orders live in BurgerPrints (external).

**Testing**: Jest (backend unit/integration, existing setup). Manual end-to-end via quickstart (guest blocked → login → draft → key prompt → create → charge). FakeAgentRuntime available for runtime-independent tests.

**Target Platform**: Linux server (backend, deployed to a gcloud VM behind nginx), modern browsers (frontend SPA).

**Project Type**: Web application (NestJS backend + React frontend).

**Performance Goals**: Interactive chat latency unaffected; uploads bounded by a max image size (default 10 MB); a real order completes end-to-end (single item, known SKU) in under 5 minutes (SC-001).

**Constraints**: Seller API key encrypted at rest, never logged/returned in plaintext (FR-006/007, SC-004). Backend enforces both gates regardless of frontend (FR-003). No duplicate real orders from one intent (FR-015). R2 secrets only in `backend/.env` (gitignored). English everything; frontend new UI Tailwind-first.

**Scale/Scope**: Single-item orders, single fulfillment provider (BurgerPrints v2). 8 new agent tools + 1 modified, 1 new upload endpoint, 3 key-management endpoints, 1 new streaming chunk type, ~2 frontend touchpoints (attach button + settings key UI + action-event handling).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is the unfilled template — no ratified principles to gate against. Applying the project's de-facto conventions instead (from CLAUDE.md + memory):

- **English everything** (code, comments, commits, logs): PASS — new code/docs in English; existing Vietnamese logs in `createOrder` will be converted as touched.
- **Frontend Tailwind-first**: PASS — new UI (settings key input, action popups, attach affordance) uses Tailwind utilities inline with CSS-var theme; no new `styles.css` component classes.
- **Git workflow (feature branch + PR, confirm before commit)**: PASS — work on `005-create-order`, PR into `main`; no auto-commits.
- **Strict verify, no fabrication**: PASS — provider response shapes for tracking/charge/cancel flagged in research.md to verify against sandbox before relying on fields; agent prompt forbids inventing data.
- **Reuse existing patterns**: PASS — order tools follow the existing `tool()` registration + try/catch axios pattern; action event extends the existing SSE chunk channel.

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-create-order/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── uploads-api.md
│   ├── me-key-api.md
│   └── agent-tools.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── uploads/                         # NEW module
│   │   ├── uploads.module.ts
│   │   ├── uploads.controller.ts        # POST /api/uploads (FileInterceptor)
│   │   └── r2.service.ts                # S3Client → R2 PutObject, returns public URL
│   ├── users/                           # key management (extend existing user area)
│   │   ├── me.controller.ts             # NEW: PUT/DELETE/GET /api/me/burgerprints-key
│   │   ├── user-key.service.ts          # NEW: set/clear/status (uses crypto util)
│   │   └── schemas/user.schema.ts       # MODIFY: + burgerprintsApiKeyEnc
│   ├── common/
│   │   └── crypto.util.ts               # NEW: AES-256-GCM encrypt/decrypt (ENCRYPTION_KEY)
│   ├── burgerprints/
│   │   └── burgerprints-tool.service.ts # MODIFY: + order tools, apiKey param, createOrder fields
│   ├── agent/
│   │   ├── agent.types.ts               # MODIFY: AgentRunInput userId/isGuest; AgentActionChunk
│   │   └── pi-agent-core.runtime.ts     # MODIFY: new tools, key resolve, action push, prompt
│   ├── conversation/
│   │   └── conversation.service.ts      # MODIFY: pass userId / isGuest; forward action chunk
│   └── config/
│       ├── configuration.ts             # MODIFY: r2.*, encryptionKey
│       └── env.validation.ts            # MODIFY: + R2_*, ENCRYPTION_KEY Joi
└── .env / .env.example                  # MODIFY: R2_* (real values only in .env), ENCRYPTION_KEY

frontend/
└── src/
    ├── App.jsx                          # MODIFY: enable attach → upload; handle action SSE events
    ├── components/
    │   └── SettingsKey.jsx (or extend)  # NEW/MODIFY: BurgerPrints key input (masked + status)
    └── (existing SSE client)            # MODIFY: parse 'action' event → popups
```

**Structure Decision**: Web application (Option 2). A dedicated `uploads/` module isolates R2; key management lives with the existing user/auth area exposed via a `/api/me` controller; all agent/order logic stays in the existing `burgerprints/` + `agent/` modules to reuse the tool-registration and streaming patterns. Frontend changes are confined to the chat composer (attach/upload + action handling) and a settings surface for the key.

## Complexity Tracking

> No constitution violations — section intentionally empty.
