<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/004-knowledge-base/plan.md`

Feature 004 adds an admin-managed knowledge layer: admins upload Markdown playbook
guides (paste or .md); an LLM generates retrieval metadata (summary/keywords/intents/
sample questions); a `retrieve_knowledge` agent tool (BM25/MiniSearch over the metadata,
reusing MemoryService's pattern) returns the most relevant guide every turn so the agent
applies uploaded know-how without code/prompt changes. Admin-only management via a
RolesGuard on User.role + a make-admin CLI. Spec & artifacts in `specs/004-knowledge-base/`.
<!-- SPECKIT END -->
