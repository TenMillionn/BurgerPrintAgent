# Implementation Plan: Knowledge Base (Admin-uploaded Playbooks)

**Branch**: `004-knowledge-base` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-knowledge-base/spec.md`

## Summary

Add an admin-managed knowledge layer: admins upload Markdown "playbook" guides (paste or `.md` file); an LLM generates retrieval metadata (summary, keywords, intents, sample questions); a new `retrieve_knowledge` agent tool searches that metadata (BM25/MiniSearch, reusing the memory-search pattern) and returns the most relevant guide's content, which the agent loads into context every turn before answering. Admin-only management (list/delete/reprocess) via a role guard on the existing `User.role`; a CLI/seed script promotes a user to admin. No code/system-prompt change is needed to add new know-how.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 20, NestJS 10

**Primary Dependencies**: @nestjs/mongoose + Mongoose, @nestjs/platform-express (multer FileInterceptor) for `.md` upload, minisearch (BM25, already used by MemoryService), class-validator, @nestjs/swagger; the configured OpenAI-compatible model (OPENAI_API_KEY/OPENAI_BASE_URL/LLM_MODEL) for metadata generation; frontend React 18 + i18n

**Storage**: MongoDB (`knowledgedocs` collection); MiniSearch index built in-memory per retrieval (small corpus)

**Testing**: Jest unit + Supertest e2e; curl smoke

**Target Platform**: Linux server (Docker Compose), nginx + Cloudflare HTTPS

**Project Type**: Web service (NestJS) + React frontend

**Performance Goals**: Every-turn retrieval adds only a small delay (BM25 over tens–thousands of metadata records is sub-ms once built); does not change real-time streaming

**Constraints**: Admin-only management; reuse existing auth + MiniSearch; English everywhere (code/comments/commits); confirm-before-commit, feature-branch + PR.

**Scale/Scope**: Tens to low-thousands of guides → keyword/metadata BM25 sufficient (no vector store in v1)

## Constitution Check

`.specify/memory/constitution.md` is an unfilled template — no project-specific gates. Apply standard practices: reuse existing modules (auth/role, MiniSearch), no secrets in code, tests for new endpoints + the tool. **No gate violations.**

## Reuse map (what already exists)
- **MiniSearch BM25** — `MemoryService.searchHistory` (`src/memory/memory.service.ts`): index build + Unicode tokenizer + `search()`. Mirror for guides.
- **User.role** (`src/users/schemas/user.schema.ts`) — `'user' | 'admin'`; global `JwtAuthGuard` sets `req.user`. Add a `RolesGuard` + `@Roles('admin')`.
- **Agent tool wiring** (`src/agent/pi-agent-core.runtime.ts` `buildTools`) + `agent.module.ts` (imports BurgerPrintsModule, MemoryModule) — add KnowledgeModule + inject `KnowledgeService` for the `retrieve_knowledge` tool.
- **File upload** — `@nestjs/platform-express` present → `FileInterceptor` for `.md`.
- **LLM access** — reuse the model config; a small `KnowledgeAiService` calls `/chat/completions` (JSON) to produce metadata.

## Project Structure

### Documentation (this feature)
```
specs/004-knowledge-base/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md
└── checklists/requirements.md
```

### Source Code — files to add/change
```
backend/src/
├── auth/
│   ├── guards/roles.guard.ts            # NEW — checks req.user.role
│   └── decorators/roles.decorator.ts    # NEW — @Roles('admin')
├── knowledge/                           # NEW module
│   ├── knowledge.module.ts
│   ├── knowledge.controller.ts          # POST (text or .md), GET list, DELETE, POST :id/reprocess (admin)
│   ├── knowledge.service.ts             # CRUD + retrieve(query) via MiniSearch over metadata
│   ├── knowledge-ai.service.ts          # LLM → {summary, keywords, intents, sampleQuestions}
│   ├── schemas/knowledge.schema.ts      # KnowledgeDoc
│   └── dto/create-knowledge.dto.ts
├── agent/
│   ├── pi-agent-core.runtime.ts         # + retrieve_knowledge tool + system-prompt "retrieve every turn"
│   └── agent.module.ts                  # import KnowledgeModule
├── users/users.service.ts               # + promoteToAdmin(email) helper
└── scripts/make-admin.ts                # NEW — CLI: promote a user to admin by email

frontend/src/
├── components/KnowledgePanel.jsx        # NEW — admin-only: paste/upload + list + delete
└── App.jsx                              # show panel when user.role === 'admin'
```

## Phase 0 — Research
See [research.md](./research.md). Key decisions: metadata-over-content indexing, always-retrieve vs threshold, how the tool returns guide content, admin promotion mechanism, upload handling (text + multipart), LLM JSON reliability.

## Phase 1 — Design & Contracts
- [data-model.md](./data-model.md) — KnowledgeDoc entity + validation + the metadata shape.
- [contracts/api.md](./contracts/api.md) — admin endpoints + the `retrieve_knowledge` tool contract.
- [quickstart.md](./quickstart.md) — promote admin, upload a guide, ask a matching question, verify it's used; verify non-admin is denied.

## Complexity Tracking
No new infrastructure (reuses Mongo + MiniSearch + existing auth/LLM). No constitution gates. Complexity stays low.
