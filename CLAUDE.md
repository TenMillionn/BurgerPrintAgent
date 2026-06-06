<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/003-auth-persistence/plan.md`

Feature 003 finishes & wires the auth + persistence layer: complete user auth
(email/password + JWT access/rotating-refresh + Google OAuth, per-user isolation),
persist conversations (list/get/rename/delete, owner-scoped) and messages (user +
assistant + tool steps, reloaded on reopen) into MongoDB, wired into the existing
SSE chat flow. Most scaffolding already exists — the work is exposing endpoints +
ownership checks + reliable persistence + frontend Sidebar wiring.
Spec & artifacts in `specs/003-auth-persistence/`.
<!-- SPECKIT END -->
