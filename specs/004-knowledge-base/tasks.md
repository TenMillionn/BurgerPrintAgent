# Tasks: Knowledge Base (Admin-uploaded Playbooks)

**Feature**: `004-knowledge-base` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Format: `[ID] [P?] [Story] Description`
- **[P]** = parallelizable (different files, no incomplete-task dependency)
- **[USx]** = user story (P1=US1 upload+index, P1=US2 retrieve+use, P3=US3 manage)
- Repo-relative paths. Everything in **English** (code, comments, commits). Reuse existing patterns.

---

## Phase 1: Setup
- [x] T001 Confirm baseline builds: `cd backend && npm run build` OK; confirm `minisearch` + `@nestjs/platform-express` are installed (they are).
- [x] T002 [P] Re-read reuse targets to mirror them: `backend/src/memory/memory.service.ts` (MiniSearch index + Unicode tokenizer + search), `backend/src/agent/pi-agent-core.runtime.ts` `buildTools` + `agent.module.ts`, `backend/src/users/schemas/user.schema.ts` (`role`).

## Phase 2: Foundational (blocking prerequisites)
- [x] T003 Add `@Roles(...roles)` decorator in `backend/src/auth/decorators/roles.decorator.ts` (SetMetadata).
- [x] T004 Add `RolesGuard` in `backend/src/auth/guards/roles.guard.ts` — read required roles from metadata, allow if `req.user.role` matches; runs after the global JwtAuthGuard.
- [x] T005 Create the `KnowledgeDoc` Mongoose schema in `backend/src/knowledge/schemas/knowledge.schema.ts` (title, content, summary, keywords[], intents[], sampleQuestions[], metadataStatus, createdBy, timestamps) per data-model.
- [x] T006 Scaffold `KnowledgeModule` in `backend/src/knowledge/knowledge.module.ts` (MongooseModule.forFeature + providers/exports) and register it in `backend/src/app.module.ts`.

---

## Phase 3: User Story 1 — Admin uploads a guide, it gets indexed (P1) 🎯 MVP

**Goal**: An admin adds a Markdown guide (paste or `.md`); the system auto-generates summary + keywords + intents + sample questions and stores it.

**Independent test**: Sign in as admin → upload (paste and `.md`) → guide appears in the list with generated metadata; non-admin is denied.

- [x] T007 [US1] `KnowledgeAiService` in `backend/src/knowledge/knowledge-ai.service.ts` — call the configured OpenAI-compatible `/chat/completions` (OPENAI_API_KEY/OPENAI_BASE_URL/LLM_MODEL) to return JSON `{summary, keywords[], intents[], sampleQuestions[]}` from markdown; validate/coerce; throw on hard failure (caller handles `pending`).
- [x] T008 [US1] `KnowledgeService.create(content, title, userId)` in `backend/src/knowledge/knowledge.service.ts` — validate non-empty; call KnowledgeAiService; on success save `metadataStatus:'ready'`, on failure save content with empty metadata + `metadataStatus:'pending'` (FR-007).
- [x] T009 [US1] `CreateKnowledgeDto` in `backend/src/knowledge/dto/create-knowledge.dto.ts` (`title?`, `content?` — content required when not a file).
- [x] T010 [US1] `KnowledgeController` `POST /knowledge` in `backend/src/knowledge/knowledge.controller.ts` — `@Roles('admin')` + RolesGuard; accept JSON paste OR multipart `.md` via `FileInterceptor('file')` (filename → default title); reject empty/oversize (FR-006); `@ApiAuth`/Swagger.
- [x] T011 [US1] `UsersService.promoteToAdmin(email)` in `backend/src/users/users.service.ts` + CLI `backend/src/scripts/make-admin.ts` (`node dist/scripts/make-admin.js <email>` → role=admin), with tsconfig including scripts.

**Checkpoint**: admin can upload (paste + `.md`) → indexed guide with metadata; non-admin 403 (quickstart 1–3, 5).

---

## Phase 4: User Story 2 — The assistant uses the right guide automatically (P1)

**Goal**: On every turn the agent retrieves the most relevant guide and follows it; if none relevant, it answers normally.

**Independent test**: upload a guide; ask a matching (differently-phrased) question → answer follows the guide; ask an unrelated question → unaffected; agent never mentions guides/tools.

- [x] T012 [US2] `KnowledgeService.retrieve(query)` in `backend/src/knowledge/knowledge.service.ts` — build a MiniSearch index over `title+summary+keywords+intents+sampleQuestions` (mirror MemoryService: Unicode tokenizer, fuzzy+prefix, BM25), return top 1–2 above a score floor with `{id,title,summary,content}` (content truncated); `[]` if none relevant (FR-009, FR-011, FR-012).
- [x] T013 [US2] Export `KnowledgeService` from `KnowledgeModule` and import `KnowledgeModule` in `backend/src/agent/agent.module.ts`; inject `KnowledgeService` into `PiAgentCoreRuntime`.
- [x] T014 [US2] Add the `retrieve_knowledge(query)` tool in `backend/src/agent/pi-agent-core.runtime.ts` `buildTools` → calls `KnowledgeService.retrieve`; add to `AGENT_TOOLS_INFO`; add a timeline `extractToolResults` case.
- [x] T015 [US2] System-prompt instruction (defaultSystemPrompt): at the start of every turn call `retrieve_knowledge` with the seller's request; if a guide matches, follow it; if not, answer normally; never mention guides/tools (FR-008, FR-010, FR-011).
- [x] T016 [P] [US2] FE timeline label for `retrieve_knowledge` in `frontend/src/locales/{en,vi}.js`.

**Checkpoint**: matching question applies the guide; unrelated question unaffected; voice stays natural (quickstart 4).

---

## Phase 5: User Story 3 — Manage & refresh guides (P3)

**Goal**: Admin lists, deletes, and re-processes guides.

**Independent test**: list shows guides; delete stops retrieval; reprocess regenerates metadata.

- [x] T017 [US3] `KnowledgeService.list()`, `getById(id)`, `remove(id)`, `reprocess(id)` in `backend/src/knowledge/knowledge.service.ts`.
- [x] T018 [US3] Controller endpoints `GET /knowledge`, `GET /knowledge/:id`, `DELETE /knowledge/:id`, `POST /knowledge/:id/reprocess` (all `@Roles('admin')`, Swagger) in `backend/src/knowledge/knowledge.controller.ts`.
- [x] T019 [P] [US3] Frontend `KnowledgePanel.jsx` in `frontend/src/components/` — paste textarea + `.md` file picker → `POST /knowledge`; list (`GET`) with delete + reprocess; i18n labels in `frontend/src/locales/{en,vi}.js`.
- [x] T020 [US3] Wire the panel into `frontend/src/App.jsx` — show only when `auth.user.role === 'admin'` (e.g. a Sidebar entry / modal); use `apiFetch` (auth + refresh).

---

## Phase 6: Polish & Cross-Cutting
- [ ] T021 [P] Swagger: annotate all `/knowledge` endpoints (admin 403, request/response) and confirm they appear in `/docs`.
- [ ] T022 [P] Unit test `KnowledgeService.retrieve` (intent/sample-question match + score floor) and `RolesGuard` (admin vs non-admin) in `backend/test/`.
- [x] T023 Run `specs/004-knowledge-base/quickstart.md` end-to-end (promote admin → upload paste + `.md` → matching question applies guide → unrelated unaffected → non-admin 403 → delete).
- [ ] T024 [P] Verify build + existing tests pass; no Vietnamese in new code/comments; update `docs/Agent-Implementation.md` with the knowledge tool + endpoints.

---

## Dependencies & order
- Setup (T001–T002) → Foundational (T003–T006) → stories.
- **US1 (T007–T011)** depends on T003–T006. MVP.
- **US2 (T012–T016)** depends on T005 (schema) + T008 (so guides exist); T013 before T014.
- **US3 (T017–T020)** depends on T005–T006; FE (T019–T020) after T018.
- Polish (T021–T024) last.

## Parallel opportunities
- T003 ∥ T005 (different files); T016/T019 (FE) ∥ backend; T021/T022/T024 ∥.

## Suggested MVP
**US1 + US2** (T001–T016): admins can grow know-how AND the agent applies it — the core value. US3 (manage) is incremental.

## Summary
- Total: **24 tasks** (Setup 2 · Foundational 4 · US1 5 · US2 5 · US3 4 · Polish 4)
- Heavy reuse: RolesGuard on existing role, MiniSearch from MemoryService, agent tool wiring, FileInterceptor, apiFetch.
