# BurgerPrintsAgent — POD Fulfillment Assistant

> From hundreds of factories to one perfect SKU — and from "I want to order this" to a paid order — let an AI agent do the heavy lifting.

A conversational AI assistant that helps **print-on-demand (POD) sellers** on BurgerPrints **search, compare, choose, and order** fulfillment products (product × factory × SKU × price × shipping) in **natural language (VN/EN)**, using the **BurgerPrints API v2** as the real data source. Topic **BP1** (sponsor: BurgerPrints).

🔗 **Live demo:** https://burgerprint.vocatee.com/

## ✨ Features

- 💬 **Multi-turn chat** with context — not a static filter form.
- ⚡ **Real-time SSE streaming** — answers appear token-by-token, with a live tool timeline.
- 🤖 **Tool-calling agent** — looks up the real BurgerPrints catalog on demand; never fabricates data.
- 🌐 **Bilingual VN/EN** — replies in the language of the question.
- 🔎 **Catalog intelligence** — search products, compare factories, list SKUs/colors/sizes, size charts, print options, shipping fees, and precise margin math.
- 🧾 **End-to-end ordering** — place and pay for a single-item order through chat, on the seller's own BurgerPrints account, behind **two explicit confirmation gates** (create → charge):
  - Create an **unpaid order** that returns the live **base + shipping + total** quote, then **charge** it separately.
  - Look up / list / track / cancel / delete orders.
- 🎨 **Validated print-file pipeline** — an in-chat **upload card** collects the design; uploads land on **Cloudflare R2**; the agent **validates resolution** against the factory list and **auto resize/crops** invalid files (`sharp`, cover + centre crop) to a valid size.
- 🔐 **Per-seller BurgerPrints API key** — stored **AES-256-GCM encrypted**; real orders run on the seller's account/wallet. Auth + key gates are surfaced to the UI (login / settings prompts) and enforced server-side.
- 🧠 **Knowledge base** — admins upload Markdown playbooks; the agent retrieves the most relevant guide every turn (BM25/MiniSearch) and follows it.
- 📚 **Conversation memory** — long-term history (MongoDB) + session/cache (Redis) + BM25 history search.
- 🔑 **JWT + Google OAuth** auth; **env-driven config** with fail-fast Joi validation (no hardcoded secrets).

## 🏗️ Architecture

```
        ┌──────────────── frontend/ (React + Vite, SSE client) ────────────────┐
        │   chat UI · upload card · buttons · API-key & QR modals (Tailwind)    │
        └───────────────────────────────┬──────────────────────────────────────┘
                                         │  /api  (nginx proxy, SSE)
        ┌────────────────────────── backend/ (NestJS) ─────────────────────────┐
        │  conversation (@Sse) ──► AgentRuntime (port) ──► pi-agent-core (ESM)  │
        │  auth (JWT/OAuth)              │  tools                               │
        │  uploads/design (R2 + sharp)   ▼                                      │
        │  users (encrypted key)   BurgerPrints API v2  ·  Knowledge (MiniSearch)│
        │  session (Redis) · MongoDB (history, users, design assets)            │
        └───────────────────────────────────────────────────────────────────────┘
```

- Every external integration sits behind its **own module + port** → isolated and testable (the `AgentRuntime` port is overridden with a fake in tests).
- Agent runtime: [`@earendil-works/pi-agent-core`](https://www.npmjs.com/package/@earendil-works/pi-agent-core) (the "Pi" toolkit), integrated in-process behind the `AgentRuntime` port. Transient LLM errors (429/5xx, upstream timeouts) are retried via `agent.continue()`.

## 🧰 Agent tools

| Group | Tools |
|---|---|
| Catalog | `search_products`, `compare_factories`, `get_product_variants`, `get_product_detail`, `get_product_colors`, `get_decorations`, `get_related_products`, `get_size_chart`, `get_shipping`, `calculate_margin` |
| Orders | `create_order` (unpaid quote), `charge_order`, `get_balance`, `list_orders`, `get_order`, `get_order_tracking`, `cancel_order`, `delete_order` |
| Design files | `request_design_upload`, `validate_design`, `process_design`, `list_design_assets` |
| Gates & UX | `check_auth`, `require_seller_key`, `render_buttons` |
| Assist | `retrieve_knowledge`, `search_history`, `fetch_url` |

## 🚀 Quick start (≤ 10 min)

**Backend** (Docker brings up app + Redis + MongoDB):

```bash
cd backend
cp .env.example .env
# Fill: BURGERPRINTS_API_BASE_URL, BURGERPRINTS_API_KEY, JWT_SECRET,
#       LLM_PROVIDER + (OPENAI_API_KEY | ANTHROPIC_API_KEY),
#       R2_* (Cloudflare R2), ENCRYPTION_KEY
docker compose up --build
curl http://localhost:3000/health
```

**Frontend** (Vite dev server, proxies `/api` → backend):

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

See [`backend/README.md`](backend/README.md) for the full env table and dev commands.

## 📡 Selected API

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET | `/conversations/:id/stream?message=...` | **SSE** chat (`token`/`tool`/`action`/`buttons`/`upload_card`/`done`) | JWT |
| POST | `/conversations` | Create a conversation → `{ sessionId }` | JWT |
| POST | `/uploads/design` | Upload a print file → R2 + `DesignAsset` | JWT |
| GET | `/design/assets?conversationId=` | List a conversation's design assets | JWT |
| PUT/GET/DELETE | `/me/burgerprints-key` | Manage the seller's encrypted API key (status shows only `{configured,last4}`) | JWT |
| POST | `/uploads` | Generic image upload → public URL | JWT |
| POST | `/auth/login`, `/auth/register`, `/auth/google` | Auth | Public |
| GET | `/health` | Readiness (Redis + MongoDB) | Public |

## 🧱 Tech stack

**Backend:** NestJS 10 (TypeScript, Node 20) · SSE · `@earendil-works/pi-agent-core` + `pi-ai` · MongoDB 7 (Mongoose) · Redis 7 (ioredis) · `@aws-sdk/client-s3` (Cloudflare R2) · `sharp` (image resize/crop) · Passport (JWT + Google OAuth2) · Joi · Docker Compose · Jest.

**Frontend:** React 18 + Vite · Tailwind (utility-first, CSS-var theming) · `react-markdown` + KaTeX · `qrcode.react` · framer-motion · lucide-react. Also ships as a Chrome side-panel extension build.

## 📂 Structure

```
backend/   # NestJS API
  src/{conversation,agent,session,burgerprints,design,uploads,users,knowledge,redis,config,health,common}
  test/{unit,e2e}
frontend/  # React + Vite chat UI (+ Chrome extension build)
  src/{components,locales}
specs/     # spec-kit artifacts per feature (spec, plan, research, data-model, contracts, tasks)
docs/      # api-specs.md (BurgerPrints API v2), requirements, use cases, knowledge-samples/
```

Built spec-first with [spec-kit](https://github.com/github/spec-kit) (specify → plan → tasks → implement). Feature specs:

- `001-nestjs-backend-foundation` — SSE chat skeleton + `AgentRuntime` port + Redis session.
- `002-burgerprint-api-sync` — catalog sync + search (MiniSearch / full-text).
- `003-auth-persistence` — JWT + Google OAuth + MongoDB history.
- `004-knowledge-base` — admin-managed Markdown playbooks + `retrieve_knowledge`.
- `005-create-order` — ordering, per-seller encrypted key, gates, R2 upload.
- `006-design-file-pipeline` — upload card, resolution validation, auto resize/crop.

## 🔐 Security

All credentials come from env — **never hardcoded**. `.env` is gitignored (only `.env.example` placeholders are committed). Seller API keys are AES-256-GCM encrypted at rest and never logged or returned in plaintext. Both the auth and the per-seller-key gates are enforced server-side regardless of the UI.

## ☁️ Deployment

Self-hosted on a VPS: `docker compose up -d --build` (app + Redis + MongoDB) behind nginx, which serves the built `frontend/dist` and proxies `/api` → the backend (SSE buffering off). The `main` branch is what runs in production. R2 and encryption secrets live only in the server's `backend/.env`.

## ✅ Status

Live and deployed: catalog Q&A + margin, knowledge base, end-to-end ordering (create → quote → charge), and the validated design-file pipeline. Roadmap: multi-item orders, webhook-driven order status, and optional image-vision analysis of designs.
