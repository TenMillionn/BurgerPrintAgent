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

## Conventions

### Frontend styling — Tailwind first
All NEW frontend UI must be styled with **Tailwind utility classes inline in the JSX**, not new custom CSS classes in `styles.css`.
- Use Tailwind utilities for layout, spacing, sizing, typography, borders, transitions, hover states.
- For theme colors, reference the existing CSS variables via arbitrary values, e.g. `bg-[var(--accent)]`, `text-[var(--text-primary)]`, `border-[var(--border-medium)]`, `hover:bg-[var(--bg-sidebar-hover)]` — do NOT hardcode hex colors (keeps dark/light theming working).
- Arbitrary values are fine when a token isn't enough: `h-[0.72em]`, `top-3.5`, `right-[18px]`, `leading-[1.45]`.
- Only touch `styles.css` for the existing design-system primitives or genuinely global rules (e.g. `chat-markdown`); do not grow it with new component classes.
