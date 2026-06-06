# Implementation Plan: Auth & Conversation Persistence

**Branch**: `003-auth-persistence` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-auth-persistence/spec.md`

## Summary

Auth and persistence are largely scaffolded already; this feature **finishes and wires** them. Auth (email/password register/login, JWT access + rotating refresh, Google OAuth, logout, account lockout) and async message persistence to MongoDB are **already working**. The remaining work is mostly **exposing and hardening**: add the conversation-management endpoints (list / get-with-messages / rename / delete) on top of the existing repository methods, enforce per-user ownership on every conversation/message operation, persist assistant **tool steps**, auto-derive a conversation title, make persistence reliable (no silent message loss), harden Google OAuth config, and wire the frontend Sidebar to list/reopen/rename/delete conversations.

## Technical Context

**Language/Version**: TypeScript 5 / Node.js 20, NestJS 10

**Primary Dependencies**: @nestjs/jwt, Passport (passport-jwt, passport-local, passport-google-oauth20), bcrypt, @nestjs/mongoose + Mongoose, class-validator/class-transformer, @nestjs/swagger; frontend React 18 + Vite + i18n

**Storage**: MongoDB (users, refresh_tokens, conversations, messages) + Redis (live session turns/cache, TTL)

**Testing**: Jest (unit) + Supertest (e2e) — existing `backend/test/`; plus curl smoke against running app

**Target Platform**: Linux server (Docker Compose: app + redis + mongo), behind nginx (SSE)

**Project Type**: Web service (NestJS backend) + React frontend

**Performance Goals**: Real-time SSE streaming unchanged; conversation list/reopen responsive (<1s typical history); persistence must not block the streamed response

**Constraints**: Do NOT change the real-time streaming experience; persistence wraps around it. Everything (code, comments, commits) in English. Confirm before commit/deploy; feature-branch + PR into main.

**Scale/Scope**: Single seller per account; thousands of conversations per user; bounded message-history load (pagination if needed)

## Constitution Check

`.specify/memory/constitution.md` is an unfilled template — no project-specific gates defined. Apply standard practices: cohesive modules, reuse existing scaffolding instead of rebuilding, no secrets in code, tests for new endpoints. **No gate violations.**

## Current State → Gap Map (basis for tasks)

### ✅ Already implemented (do NOT rebuild)
- Auth endpoints: `POST /auth/register|login|refresh|logout`, `GET /auth/me`, `GET /auth/google[/callback]`.
- JWT access + UUID refresh token in Mongo; **refresh rotation** + revoke + FIFO cap (5/user); account lockout (5 fails / 15 min); bcrypt hashing.
- Google OAuth strategy + account linking (by providerId then email).
- Global `JwtAuthGuard` (APP_GUARD) + `@Public()` override; `req.user` = full UserDocument.
- Conversation + Message Mongoose schemas; `ConversationRepository` with `createConversation`, `findConversationById`, `findActiveConversationsByUser`, `saveMessage`, `getMessagesByConversation`, `updateConversationTitle`.
- Chat flow persists **both** user and assistant messages to Mongo (async) + Redis turns; Mongo fallback when Redis session expired.

### ⚠️ Partial — to harden
- Message save is **fire-and-forget** (`SessionService.appendTurn` → `saveMessage(...).catch(log)`): on DB error the message is silently lost. → make reliable (await user message; structured error; never lose the seller's message).
- **Tool steps not persisted**: `Message.metadata` (Mixed) exists but assistant tool steps aren't written. → save `{ toolSteps: [{name, order}] }` in metadata so reopened history can show them.
- Conversation **title** is static `'New Conversation'`. → auto-derive from the first seller message.
- Google OAuth uses **hardcoded dummy credentials** when env missing. → require real config; fail-fast or disable the route cleanly.

### ❌ Missing — to build
- `GET /conversations` — list current user's conversations (newest-updated first: id, title, timestamps).
- `GET /conversations/:id` — conversation + ordered messages (history reload).
- `PUT /conversations/:id` — rename.
- `DELETE /conversations/:id` — delete conversation **and** its messages.
- **Ownership enforcement**: every `:id`/`:sessionId` op verifies the conversation's `userId === req.user._id` → 404/403 otherwise.
- **Frontend**: Sidebar lists conversations, opening one loads its history, rename, delete; starting a chat creates a conversation and it appears in the list.

## Project Structure

### Documentation (this feature)
```
specs/003-auth-persistence/
├── spec.md
├── plan.md            # this file
├── research.md        # Phase 0 decisions
├── data-model.md      # entities + relationships + validation
├── quickstart.md      # how to run + verify
├── contracts/
│   └── api.md         # endpoint contracts (auth + conversations + messages)
└── checklists/
    └── requirements.md
```

### Source Code (repository root) — files to add/change
```
backend/src/
├── auth/strategies/google.strategy.ts   # require real env, drop dummy fallback
├── conversation/
│   ├── conversation.controller.ts       # + GET / · GET /:id · PUT /:id · DELETE /:id (ownership)
│   ├── conversation.service.ts          # + list/get/rename/delete; auto-title; reliable persist
│   ├── conversation.repository.ts       # + deleteConversation(+messages); ownership-scoped queries
│   └── dto/                             # + rename dto, list/detail response dto
├── session/session.service.ts          # appendTurn: reliable persist; carry assistant tool steps
└── agent/agent.types.ts                # capture tool-step list for persistence (already streamed)

frontend/src/
├── components/Sidebar.jsx               # list conversations, select, rename, delete, new chat
└── App.jsx                             # load history on open; create conversation; refresh list
```

## Phase 0 — Research
See [research.md](./research.md). Few unknowns (stack fixed, mostly built). Key decisions: ownership-check strategy, reliable-persistence approach (await seller message vs fire-and-forget assistant), tool-step shape, title derivation, history pagination, OAuth config handling.

## Phase 1 — Design & Contracts
- [data-model.md](./data-model.md) — User, RefreshToken, Conversation, Message (fields already in schemas; documents validation, relationships, and the `metadata.toolSteps` shape).
- [contracts/api.md](./contracts/api.md) — request/response for auth (existing) + the new conversation endpoints + ownership/error behavior.
- [quickstart.md](./quickstart.md) — run backend, register, chat, list/reopen/rename/delete, verify persistence + isolation via curl.

## Complexity Tracking
No constitution gates; no extra projects or patterns introduced beyond what already exists. Reusing existing modules keeps complexity low.
