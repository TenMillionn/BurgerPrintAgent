# Feature Specification: Knowledge Base (Admin-uploaded Playbooks)

**Feature Branch**: `004-knowledge-base`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Admin uploads Markdown playbook guides (paste or .md file); an LLM generates retrieval metadata (summary, keywords, intents, sample questions); the chat agent retrieves the most relevant guide(s) on every turn and loads them into context before answering; only admins manage guides; provide a way to make a user an admin. Goal: non-developers grow the assistant's know-how without changing code or the system prompt."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin uploads a guide and the assistant gets smarter (Priority: P1)

An admin writes (or has) a short Markdown guide explaining how to handle a recurring question — e.g. "How to estimate profit margin on Etsy" or "How to pick the cheapest factory for EU shipping". They open the admin area, paste the Markdown (or upload a `.md` file), and submit. The system reads the guide and automatically produces a short summary plus search hints (keywords, intents, example questions). The guide is now part of the assistant's knowledge, with no code or prompt changes.

**Why this priority**: This is the core value — letting non-developers extend the assistant's know-how. Without upload + auto-indexing, there is no knowledge base.

**Independent Test**: Sign in as an admin, upload a guide, and confirm it appears in the guide list with an auto-generated summary and search hints.

**Acceptance Scenarios**:

1. **Given** an admin in the admin area, **When** they paste Markdown and submit, **Then** the guide is saved and a summary + keywords + intents + sample questions are generated and shown.
2. **Given** an admin, **When** they upload a `.md` file, **Then** the file's content is ingested the same way as pasted text.
3. **Given** a saved guide, **When** the admin views the guide list, **Then** they see its title, summary, and when it was added, and can open or delete it.
4. **Given** a non-admin (regular seller), **When** they try to access the admin area or upload/list/delete a guide, **Then** access is denied.
5. **Given** an empty or non-Markdown/unsupported upload, **When** submitted, **Then** it is rejected with a clear message and nothing is saved.

---

### User Story 2 - The assistant uses the right guide automatically (Priority: P1)

A seller asks a question the assistant has a guide for. Before answering, the assistant finds the most relevant guide(s) and follows them — so the answer reflects the uploaded know-how (the right steps, the right things to check, the right follow-up questions). If no guide is relevant, the assistant answers as it normally would, with no degradation.

**Why this priority**: Uploading guides is pointless unless the assistant actually applies them. Automatic, every-turn retrieval is what turns stored guides into better answers.

**Independent Test**: Upload a guide for a specific question type, ask a matching question in chat, and confirm the answer follows the guide; ask an unrelated question and confirm the answer is unaffected.

**Acceptance Scenarios**:

1. **Given** a guide exists for a topic, **When** a seller asks a question on that topic (even phrased differently from the guide), **Then** the assistant retrieves that guide and its answer reflects the guide's approach.
2. **Given** no guide is relevant to the seller's message, **When** they ask, **Then** the assistant answers normally without referencing or inventing a guide.
3. **Given** several guides exist, **When** a seller asks, **Then** only the most relevant guide(s) are used — unrelated guides do not pollute the answer.
4. **Given** retrieval happens on every turn, **When** the seller chats, **Then** the streaming/real-time experience is not noticeably degraded.

---

### User Story 3 - Manage and refresh guides (Priority: P3)

An admin keeps the knowledge base tidy: lists existing guides, deletes outdated ones, and can re-process a guide to regenerate its summary/search hints after editing.

**Why this priority**: Maintenance keeps the knowledge base accurate over time, but the assistant is already useful after upload + retrieval, so this is lower priority.

**Independent Test**: As an admin, delete a guide and confirm it no longer influences answers; re-process a guide and confirm its search hints update.

**Acceptance Scenarios**:

1. **Given** an admin viewing the list, **When** they delete a guide, **Then** it is removed and no longer retrieved or used in answers.
2. **Given** an edited guide, **When** the admin re-processes it, **Then** its summary/keywords/intents/sample questions are regenerated from the new content.

---

### Edge Cases

- A guide whose wording shares no exact words with the seller's question (only the intent matches) should still be findable via the generated intents/sample questions.
- A very long guide should still be ingested and retrievable; only the relevant guide content is loaded into the answer context (bounded).
- Two guides on similar topics → the most relevant is preferred; ties do not produce contradictory answers.
- Metadata generation temporarily unavailable → the guide is still saved (with raw content) and can be re-processed later; it should not silently disappear.
- Uploading a duplicate/near-duplicate guide → allowed, but the admin can see and remove duplicates.
- No guides uploaded yet → the assistant behaves exactly as before (no errors, no empty-guide noise).

## Requirements *(mandatory)*

### Admin & access
- **FR-001**: The system MUST restrict uploading, listing, re-processing, and deleting guides to admin users only; non-admins MUST be denied.
- **FR-002**: The system MUST provide a way to grant a user the admin role (e.g. a seed/promotion step) without manual database surgery by the end user.

### Upload & ingestion
- **FR-003**: Admins MUST be able to add a guide by pasting Markdown text OR by uploading a `.md` file; both paths produce the same stored result.
- **FR-004**: On ingestion the system MUST automatically generate retrieval metadata from the guide content: a short summary, keywords, intents, and sample questions.
- **FR-005**: The system MUST store the original guide content together with its generated metadata and a human-readable title.
- **FR-006**: The system MUST reject empty or unsupported uploads with a clear message and persist nothing in that case.
- **FR-007**: If metadata generation fails, the system MUST still save the guide content and allow re-processing later (no data loss, no silent drop).

### Retrieval & use in chat
- **FR-008**: On every seller turn, the assistant MUST search the knowledge base for the most relevant guide(s) to the seller's message before composing its answer.
- **FR-009**: Retrieval MUST match on the generated metadata (summary/keywords/intents/sample questions), not only the raw guide words, so differently-phrased questions still match the right guide.
- **FR-010**: When a relevant guide is found, the assistant MUST load that guide's content into its working context and let it shape the answer.
- **FR-011**: When no sufficiently relevant guide is found, the assistant MUST answer normally, without inventing or forcing a guide.
- **FR-012**: Retrieval MUST be bounded (top few guides) so the answer context and latency stay reasonable, and MUST NOT noticeably degrade the real-time chat experience.

### Management
- **FR-013**: Admins MUST be able to list guides (title, summary, added date) and delete a guide; a deleted guide MUST no longer be retrieved.
- **FR-014**: Admins SHOULD be able to re-process a guide to regenerate its metadata after the content changes.

### Key Entities *(include if feature involves data)*

- **Guide (Knowledge document)**: An admin-authored playbook. Has a title, the original Markdown content, generated metadata (summary, keywords, intents, sample questions), who added it, and when.
- **Admin**: A user with elevated permission to manage guides. (Regular sellers have no guide-management access.)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can add a new guide and see it indexed (summary + search hints generated) in under 1 minute, with no developer involvement.
- **SC-002**: For a question covered by an uploaded guide, the assistant's answer reflects that guide's approach in at least 9 of 10 trials, including when the question is phrased differently from the guide's wording.
- **SC-003**: For a question with no relevant guide, the assistant's answer quality and behavior are unchanged versus having no knowledge base (0 forced/irrelevant guide use).
- **SC-004**: Only admins can manage guides — 0 successful guide management actions by non-admin accounts across testing.
- **SC-005**: Adding guides requires no code changes and no system-prompt edits.
- **SC-006**: Every-turn retrieval adds no more than a small, acceptable delay to the start of the answer (real-time chat remains usable).

## Assumptions

- This adds an unstructured **knowledge/guidance** layer; structured catalog data (products, prices, shipping) continues to come from the existing catalog tools, not from guides.
- Guides are trusted internal content authored by admins (no public/seller submission, no moderation pipeline needed in v1).
- The volume of guides is small-to-moderate (tens to low thousands), so keyword/metadata search is sufficient without a separate semantic/vector store in v1.
- The existing sign-in and the existing conversation-memory search mechanism are reused; this feature extends them rather than introducing a new auth or search system.
- "Loading a guide into context" means making the guide's content available to the assistant for the current answer, not permanently changing the global system prompt.
- Markdown is the guide format; other formats are out of scope for v1.
