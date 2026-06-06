# Phase 1 Data Model: Auth & Conversation Persistence

All collections already exist as Mongoose schemas. This documents the entities, relationships, validation, and the one new convention (`Message.metadata.toolSteps`). No breaking schema changes are required.

## User  (`users`)
| Field | Type | Notes |
|-------|------|-------|
| _id | ObjectId | PK |
| email | string | unique, required, lowercased |
| passwordHash | string? | null for OAuth-only users |
| displayName | string? | |
| avatar | string? | |
| authProvider | 'local' \| 'google' | default 'local' |
| providerId | string? | sparse-unique; set for OAuth |
| role | 'user' \| 'admin' | default 'user' |
| isActive | boolean | default true |
| failedLoginAttempts | number | default 0 (lockout) |
| lockUntil | Date? | account locked until |
| lastLoginAt | Date? | |
| createdAt / updatedAt | Date | auto |

**Rules**: email unique; password stored only as bcrypt hash; 5 failed logins → lock 15 min.

## RefreshToken  (`refresh_tokens`)
| Field | Type | Notes |
|-------|------|-------|
| _id | ObjectId | PK |
| token | string | unique, required (UUID) |
| userId | ObjectId → User | required |
| expiresAt | Date | required; TTL index auto-deletes on expiry |
| revokedAt | Date? | set on rotation/logout |
| userAgent | string? | |
| ipAddress | string? | |
| createdAt / updatedAt | Date | auto |

**Rules**: a token is valid only if not expired AND `revokedAt` is null. On refresh, the presented token is revoked and a new one issued (rotation). Max 5 active per user (FIFO cleanup). Logout revokes.

**State**: `active` → `revoked` (rotation/logout) | `expired` (TTL).

## Conversation  (`conversations`)
| Field | Type | Notes |
|-------|------|-------|
| _id | ObjectId | PK |
| userId | ObjectId → User | required (owner) |
| title | string | default 'New Conversation'; auto-derived from first message; renamable |
| status | 'active' \| 'archived' | default 'active'; delete may hard-remove or archive |
| activeSessionId | string? | current Redis session id |
| summary | string? | reserved for future LLM summary/title |
| createdAt / updatedAt | Date | auto; `updatedAt` advances on each new message |

**Rules**: every read/write must match `userId === requester`. Listing = active conversations of the user, sorted `updatedAt` desc. Delete removes the conversation **and** its messages.

**Relationships**: 1 User → many Conversations; 1 Conversation → many Messages.

## Message  (`messages`)
| Field | Type | Notes |
|-------|------|-------|
| _id | ObjectId | PK |
| conversationId | ObjectId → Conversation | required |
| role | 'user' \| 'assistant' | required |
| content | string | required (seller text / assembled assistant reply) |
| timestamp | Date | default now; ordering key |
| metadata | Mixed? | see below |
| createdAt / updatedAt | Date | auto |

### `metadata` convention (new)
- Assistant message: `{ toolSteps: [{ name: string, order: number }], error?: string }`
  - `toolSteps`: tools invoked during the turn, in order (for redisplaying the timeline).
  - `error`: set when the turn failed mid-stream (FR-018), instead of a corrupt reply.
- Seller message: usually no metadata.

**Rules**: messages of a conversation load ascending by `timestamp` on reopen; seller message is persisted before the agent runs; assistant message after the turn completes.

## Relationship diagram
```
User 1───* Conversation 1───* Message
User 1───* RefreshToken
```

## Validation summary (maps to FRs)
- Duplicate email rejected (FR-001). Invalid login generic error (FR-002). OAuth match-by-email (FR-003).
- Refresh rotation + revoke-on-logout (FR-005, FR-006). Password hashed only (FR-007).
- Ownership scoping on all conversation/message ops (FR-008, FR-009).
- Title auto-derive + rename + cascade delete (FR-012, FR-014); `updatedAt` advance (FR-013).
- Persist both roles in order + tool steps + history reload + error-safe (FR-015..FR-019).
