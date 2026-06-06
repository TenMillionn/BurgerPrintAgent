# Feature Specification: Auth & Conversation Persistence

**Feature Branch**: `003-auth-persistence`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Complete the authentication & persistence layer for the BurgerPrints chatbot — user auth (email/password + JWT access/refresh + Google OAuth, per-user data isolation), persist conversations (per user, listable/deletable), persist messages (user + assistant, with tool steps, reloaded on reopen). Partial scaffolding already exists; finish and wire end-to-end with the existing SSE chat flow."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure account & sign-in (Priority: P1)

A seller creates an account (or signs in with Google), stays signed in across visits without re-entering credentials, and can only ever see their own data. Their session refreshes silently so they are not logged out mid-conversation.

**Why this priority**: Without trustworthy authentication and per-user isolation, conversations and messages cannot be safely tied to an owner — every other story depends on it. It is the minimum that makes the product usable by more than one person.

**Independent Test**: Register two separate sellers; sign in as each; confirm each receives a valid session, can refresh it, and cannot access the other seller's conversations.

**Acceptance Scenarios**:

1. **Given** a new visitor, **When** they register with email + password, **Then** an account is created and they receive an active session (access + refresh credentials).
2. **Given** a registered seller, **When** they sign in with correct credentials, **Then** they receive a valid session; with wrong credentials they are refused with a clear message and no session.
3. **Given** a seller with an existing Google account, **When** they choose "Sign in with Google", **Then** an account is created or matched by email and they receive a valid session.
4. **Given** a seller whose access credential has expired, **When** the app presents the refresh credential, **Then** a new access credential is issued and the old refresh credential can no longer be reused.
5. **Given** seller A is signed in, **When** A requests seller B's conversation or messages, **Then** access is denied.
6. **Given** a signed-in seller, **When** they sign out, **Then** their refresh credential is invalidated and can no longer be used to obtain new sessions.

---

### User Story 2 - Conversations are saved and managed (Priority: P2)

When a seller chats, the session is saved under their account with a meaningful title and timestamps. They can later see a list of their past conversations (most recent first), reopen any of them, rename, and delete ones they no longer want.

**Why this priority**: Persisted, browsable conversations are the core "my history" value of the assistant. It builds directly on auth and is required before individual messages are useful to reload.

**Independent Test**: As a signed-in seller, start a chat, reload the app, and confirm the conversation appears in the seller's list with a title and timestamps; rename and delete it and confirm the changes persist.

**Acceptance Scenarios**:

1. **Given** a signed-in seller starts a new chat, **When** the first exchange happens, **Then** a conversation record is created under that seller with a title and created/updated timestamps.
2. **Given** a seller with past conversations, **When** they open the app, **Then** they see their conversations ordered by most recently updated, with titles and timestamps.
3. **Given** a seller viewing their conversation list, **When** they delete a conversation, **Then** it (and its messages) is removed and no longer appears.
4. **Given** a seller continues an existing conversation, **When** a new message is exchanged, **Then** the conversation's "updated" timestamp advances and it moves to the top of the list.
5. **Given** a conversation owned by seller A, **When** seller B tries to open, rename, or delete it, **Then** the action is denied.

---

### User Story 3 - Full message history is preserved and reloaded (Priority: P3)

Every message — the seller's questions and the assistant's replies, including the tool steps the assistant ran — is stored under its conversation. When the seller reopens a conversation, the entire exchange is shown exactly as before, in order.

**Why this priority**: This turns saved conversations into a true transcript the seller can revisit. It depends on both auth and conversation persistence and is the richest but least-blocking slice.

**Independent Test**: Hold a multi-turn chat that triggers tool steps, reopen the conversation later, and confirm all seller and assistant messages (and the recorded tool steps) appear in the original order.

**Acceptance Scenarios**:

1. **Given** a seller sends a message, **When** the turn completes, **Then** the seller message and the assistant's full reply are saved under the conversation in order.
2. **Given** an assistant reply that ran tool steps, **When** the turn is saved, **Then** the tool steps (which tool, in what order) are saved alongside the assistant message.
3. **Given** a saved conversation, **When** the seller reopens it, **Then** all prior messages are loaded and displayed in their original order with correct roles.
4. **Given** a turn that fails mid-stream (error), **When** it is saved, **Then** the seller message is preserved and the failure is recorded without corrupting the transcript.

---

### Edge Cases

- Registering with an email that already exists → rejected with a clear "already registered" message (no duplicate account).
- A refresh credential that is expired, already used (rotated), or revoked (after sign-out) → rejected; the seller must sign in again.
- Concurrent turns in the same conversation (rapid sends) → messages are saved without loss or reordering.
- A very long conversation → listing and reopening remain responsive (history load is bounded/paginated as needed).
- Deleting a conversation that is currently open → the open view ends gracefully.
- A turn interrupted by network disconnect → the seller message is saved; no partial/duplicate assistant message corrupts history.

## Requirements *(mandatory)*

### Functional Requirements

#### Authentication & accounts
- **FR-001**: System MUST let a visitor register an account with email + password, rejecting duplicate emails and weak passwords.
- **FR-002**: System MUST let a registered seller sign in with email + password and refuse invalid credentials without revealing which field was wrong.
- **FR-003**: System MUST let a seller sign in with Google, creating a new account or matching an existing one by email.
- **FR-004**: System MUST issue a short-lived access credential and a longer-lived refresh credential on successful sign-in/registration.
- **FR-005**: System MUST issue a new access credential when presented a valid refresh credential, and MUST rotate (invalidate-and-replace) the refresh credential so a used one cannot be reused.
- **FR-006**: System MUST let a seller sign out, after which their refresh credential(s) can no longer obtain new sessions.
- **FR-007**: System MUST store passwords only in a non-reversible (hashed) form.

#### Authorization & isolation
- **FR-008**: System MUST require a valid session for all conversation and message operations.
- **FR-009**: System MUST scope every conversation and message to its owning seller and MUST deny any access to data owned by another seller.

#### Conversation persistence
- **FR-010**: System MUST create a persisted conversation, owned by the signed-in seller, when a new chat begins, with a title and created/updated timestamps.
- **FR-011**: System MUST list a seller's conversations ordered by most-recently-updated, returning title and timestamps.
- **FR-012**: Sellers MUST be able to rename and delete their own conversations; deleting a conversation MUST also remove its messages.
- **FR-013**: System MUST update a conversation's "updated" timestamp whenever a new message is added to it.
- **FR-014**: System SHOULD derive a human-readable conversation title automatically (e.g., from the first seller message) when one is not provided.

#### Message persistence
- **FR-015**: System MUST persist each seller message and each assistant reply under its conversation, preserving role and order.
- **FR-016**: System MUST persist the assistant's tool steps (which tools ran, in order) together with the assistant message.
- **FR-017**: System MUST return a conversation's full message history, in original order, when the conversation is reopened.
- **FR-018**: System MUST preserve the seller message and record the failure (without a corrupt/duplicate assistant entry) when a turn errors mid-stream.
- **FR-019**: Message persistence MUST integrate with the existing streaming chat flow without changing how replies stream to the seller in real time.

### Key Entities *(include if feature involves data)*

- **Seller (User)**: A person who uses the assistant. Identified by email; may authenticate by password and/or Google. Owns conversations.
- **Refresh credential**: A revocable, rotating token record tied to a seller, used to obtain new access credentials; can be expired, rotated, or revoked.
- **Conversation**: A chat session owned by one seller. Has a title, created/updated timestamps, and an ordered set of messages.
- **Message**: A single entry in a conversation. Has a role (seller or assistant), text content, order/timestamp, and — for assistant entries — the recorded tool steps.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new seller can go from "no account" to "signed in and chatting" in under 1 minute.
- **SC-002**: 100% of conversations and messages created while signed in are still present and correctly ordered after the seller reloads the app or signs in on another device.
- **SC-003**: A seller is never shown another seller's conversations or messages (0 cross-account leaks across testing).
- **SC-004**: Sessions refresh silently — a seller chatting continuously is never unexpectedly signed out while their refresh credential is valid.
- **SC-005**: Reopening a conversation displays its full prior history (all seller + assistant messages and tool steps) in the original order, with no missing or duplicated messages.
- **SC-006**: A used or revoked refresh credential is rejected 100% of the time.

## Assumptions

- The existing partial scaffolding (auth module, users/refresh-token/conversation/message data models, conversation repository) is the basis to finish, not to rebuild from scratch.
- The existing streaming chat flow remains the delivery mechanism; persistence is added around it without changing the real-time experience.
- Email + password and Google are the required sign-in methods for this iteration; other providers and password reset/email verification are out of scope for v1.
- A persistent data store is available for users, conversations, and messages (already provisioned in the project).
- "Tool steps" means the sequence of tools the assistant invoked during a turn (names/order), not full tool payloads, unless trivially available.
- Standard, industry-typical credential lifetimes and security practices apply unless otherwise specified.
