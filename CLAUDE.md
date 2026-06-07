<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/006-design-file-pipeline/plan.md`

Feature 006 adds a validated print-file pipeline: a `request_design_upload` tool renders an
in-chat upload card; uploads (`POST /uploads/design`) store a `DesignAsset` (conversation +
side + agent-message ref + pixel dims) on R2 and read dimensions with `sharp`;
`validate_design` checks against a fixed allowed-resolution list; `process_design` resize/crops
invalid images (cover + centre crop) to the nearest allowed size; `list_design_assets` lets the
seller pick. Ordering uses the latest valid asset per side. Spec & artifacts in
`specs/006-design-file-pipeline/`. Builds on feature 005 (`specs/005-create-order/`).

Feature 005 lets a logged-in seller create and pay for a single-item BurgerPrints
fulfillment order through chat, with two confirmation gates (create, then charge) and a
sandbox draft to preview cost. It adds: image upload to Cloudflare R2 (design/mockup →
public URL), per-seller BurgerPrints API key management (AES-256-GCM encrypted on User),
auth + key gates surfaced to the FE via a new streaming `action` chunk, and order
lifecycle agent tools (create/charge/balance/get/tracking/cancel/delete) wired into
pi-agent-core.runtime.ts. Spec & artifacts in `specs/005-create-order/`.

Prior feature 004 added the admin-managed knowledge layer (`retrieve_knowledge` tool over
admin-uploaded Markdown guides); see `specs/004-knowledge-base/`.
<!-- SPECKIT END -->

## Conventions

### Frontend styling — Tailwind first
All NEW frontend UI must be styled with **Tailwind utility classes inline in the JSX**, not new custom CSS classes in `styles.css`.
- Use Tailwind utilities for layout, spacing, sizing, typography, borders, transitions, hover states.
- For theme colors, reference the existing CSS variables via arbitrary values, e.g. `bg-[var(--accent)]`, `text-[var(--text-primary)]`, `border-[var(--border-medium)]`, `hover:bg-[var(--bg-sidebar-hover)]` — do NOT hardcode hex colors (keeps dark/light theming working).
- Arbitrary values are fine when a token isn't enough: `h-[0.72em]`, `top-3.5`, `right-[18px]`, `leading-[1.45]`.
- Only touch `styles.css` for the existing design-system primitives or genuinely global rules (e.g. `chat-markdown`); do not grow it with new component classes.
