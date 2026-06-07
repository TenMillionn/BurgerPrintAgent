# Feature Specification: Create Order (Order Creation & Management via Chat)

**Feature Branch**: `005-create-order`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "Let an authenticated seller create and pay for a BurgerPrints fulfillment order through chat, plus look up / cancel / delete orders. Phase 1 = single item per order. Two confirmation gates (create, then charge), a sandbox draft preview, per-seller API key, and image upload to Cloudflare R2 for designs/mockups."

## Overview

Today the agent can help sellers discover products, compare factories, and inspect SKUs, but it cannot complete the loop: actually placing and paying for a fulfillment order. This feature lets a logged-in seller go from "I want to order this" to a paid order entirely through chat, with explicit confirmation before anything irreversible or money-spending happens. It adds the supporting pieces that make a real order possible: uploading design/mockup artwork (hosted on object storage), supplying a shipping address, previewing the true cost (including shipping) via a sandbox draft, and using the seller's own BurgerPrints account/wallet for real orders. It also adds post-order management: status, tracking, cancel, and delete.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Place and pay for a real order through chat (Priority: P1)

A logged-in seller chooses a product SKU, uploads a design, gives a shipping address, reviews a cost preview, confirms the real order, and then confirms payment. The order is created and charged on the seller's own BurgerPrints account.

**Why this priority**: This is the core value of the feature — completing a real, paid order end-to-end. Everything else supports or extends this journey.

**Independent Test**: Logged-in seller with a configured BurgerPrints key can complete: pick SKU → upload design → enter address → see draft preview → confirm create → confirm charge → receive an order id with a "paid" state. Fully testable on its own.

**Acceptance Scenarios**:

1. **Given** a logged-in seller with a configured key, **When** they pick an in-stock SKU, upload a design, provide a complete shipping address, and confirm both gates, **Then** a real order is created and charged, and the seller is shown the order id and total.
2. **Given** the seller is at the cost-preview step, **When** the draft is produced, **Then** the seller sees base cost, shipping fee, and total before being asked to confirm a real order.
3. **Given** the seller has reviewed the draft, **When** they confirm the real order (gate 1) but do not yet confirm payment, **Then** the order is created but NOT charged, and the seller is asked separately to confirm payment (gate 2).
4. **Given** a created (unpaid) order, **When** the seller confirms payment and the wallet balance is sufficient, **Then** the order is charged and its state becomes paid.

---

### User Story 2 - Upload a design/mockup image (Priority: P1)

A seller attaches a design (and optionally a mockup) image in chat. The image is stored and becomes a public URL that can be used on the order.

**Why this priority**: An order cannot be fulfilled without artwork; without upload there is no way to turn a seller's file into the public URL the fulfillment order requires. P1 because US1 depends on it.

**Independent Test**: A seller can attach an image in the composer, the file is accepted (type/size validated), and a public URL is returned and visibly attached to the turn — testable without placing an order.

**Acceptance Scenarios**:

1. **Given** a logged-in seller, **When** they attach a valid image file, **Then** the file is uploaded and a public URL is produced and attached to the message.
2. **Given** a seller attaches a non-image file or an oversized file, **When** they try to upload, **Then** the upload is rejected with a clear reason and no broken URL is attached.
3. **Given** the agent is collecting design artwork, **When** the seller has not uploaded a design for the item, **Then** the agent does not proceed to create a real order and asks for the design.

---

### User Story 3 - Authentication gate before ordering (Priority: P1)

Before collecting any order information, the agent verifies the seller is logged in. A guest is prompted to log in and the order flow does not start.

**Why this priority**: Orders are tied to a real account and wallet; a guest must not be able to start an order flow. Security-critical, so P1.

**Independent Test**: A guest who asks to place an order is shown a login prompt and the agent stops collecting order details. After logging in, the flow can begin. Testable independently of upload/order specifics.

**Acceptance Scenarios**:

1. **Given** a guest (not logged in), **When** they ask to create an order, **Then** the agent triggers a login prompt and does not collect order details.
2. **Given** a logged-in seller, **When** they ask to create an order, **Then** the agent proceeds to collect order details without a login prompt.

---

### User Story 4 - Configure the seller's own BurgerPrints API key (Priority: P1)

When the seller is ready to move from a draft preview to a real order, they are prompted to configure their own BurgerPrints API key (if not already configured). The key is stored securely and used for all real order operations.

**Why this priority**: Real orders and charges must run on the seller's own account/wallet, not the platform's. Without this, real orders cannot be attributed or paid correctly. P1.

**Independent Test**: A logged-in seller without a configured key who reaches the real-order step is prompted to open settings and save a key; after saving, the status shows "configured" (with only the last few characters revealed). Testable independently of placing an order.

**Acceptance Scenarios**:

1. **Given** a logged-in seller without a configured key, **When** they pass the draft preview and attempt a real order, **Then** they are prompted to configure their key and the real order does not proceed.
2. **Given** a seller saving a key, **When** they submit it, **Then** the key is stored securely and the saved key value is never displayed back in full or returned in plaintext.
3. **Given** a seller with a configured key, **When** they view settings, **Then** they see that a key is configured plus only a masked hint (e.g. last 4 characters), never the full key.

---

### User Story 5 - Look up, track, cancel, and delete an order (Priority: P2)

After ordering, the seller can ask for an order's status and tracking, and can cancel or delete an order.

**Why this priority**: Important for a complete experience but not required to place the first order. P2.

**Independent Test**: For an existing order id (on the seller's account), the seller can retrieve status and tracking, and can cancel or delete it (with confirmation). Testable independently of the create flow.

**Acceptance Scenarios**:

1. **Given** a seller with a configured key and an existing order, **When** they ask for its status, **Then** they see the order's state and key details.
2. **Given** a seller with an existing order, **When** they ask for tracking, **Then** they see tracking information when available, or a clear "not available yet" message.
3. **Given** a seller who wants to cancel or delete an order, **When** they confirm the action, **Then** the order is cancelled or deleted and the result is reported.

---

### Edge Cases

- **Out-of-stock SKU**: the chosen SKU is out of stock → the agent must not order it and should surface alternatives.
- **Incomplete/invalid shipping address**: missing required fields, or a US order without a 2-letter state code, or an invalid country code → the agent re-asks for the specific field rather than guessing.
- **Insufficient wallet balance at charge**: the order stays created-but-unpaid; the seller is told to top up, and is NOT charged.
- **Duplicate submission**: the seller re-confirms/re-clicks → the system must not create a duplicate real order for the same intent.
- **Draft fails / shipping fee unavailable**: the draft step errors → the agent reports it could not compute the total rather than proceeding blindly.
- **Real order rejected for missing/invalid artwork**: the agent must ensure a valid design URL exists before attempting a real order.
- **Key removed mid-flow / invalid key**: a real-order or charge call fails due to a missing or rejected key → the seller is prompted to (re)configure the key; no partial charge occurs.
- **Guest reaches a money/account action via a crafted request**: the backend rejects it regardless of the frontend state.
- **Upload of corrupt or zero-byte image**: rejected with a clear reason.

## Requirements *(mandatory)*

### Functional Requirements

#### Authentication & authorization gates

- **FR-001**: The system MUST verify the seller is authenticated before collecting any order information; a non-authenticated (guest) seller MUST be prompted to log in and the order flow MUST NOT start.
- **FR-002**: The system MUST require a seller-configured BurgerPrints API key before creating a real (non-sandbox) order or performing any charge/balance/order-management operation; if absent, the seller MUST be prompted to configure it and the operation MUST NOT proceed.
- **FR-003**: The backend MUST enforce both the authentication gate and the key gate independently of the frontend; frontend prompts are user-experience aids only and MUST NOT be the sole enforcement.
- **FR-004**: When a gate blocks a step, the system MUST signal the frontend to surface the appropriate prompt (login or key setup) and the agent MUST pause and explain the next step to the seller.

#### Seller API key management

- **FR-005**: Sellers MUST be able to save their BurgerPrints API key and clear it.
- **FR-006**: The system MUST store the seller API key encrypted at rest and MUST NOT log it or return it in plaintext.
- **FR-007**: The key status view MUST reveal only whether a key is configured plus a short masked hint (e.g. last 4 characters), never the full key.

#### Cost preview (draft)

- **FR-008**: Before a real order, the system MUST produce a sandbox draft and present the base cost, shipping fee, and total to the seller for review.
- **FR-009**: The draft (sandbox) MUST be possible without the seller's own key (using the platform's shared key) so the seller can preview cost before configuring a key.

#### Order creation & payment (two gates)

- **FR-010**: All orders MUST default to sandbox (test) until the seller explicitly confirms a real order.
- **FR-011**: Creating a real order MUST require an explicit seller confirmation (gate 1), distinct from the draft preview.
- **FR-012**: Charging/paying for an order MUST require a separate explicit seller confirmation (gate 2); the system MUST NOT automatically charge immediately after creating a real order.
- **FR-013**: Before charging, the system MUST check the wallet balance; if insufficient, it MUST NOT charge and MUST inform the seller, leaving the order created-but-unpaid.
- **FR-014**: Real order creation, charge, balance, tracking, status, cancel, and delete MUST operate on the seller's own BurgerPrints account (using the seller's key).
- **FR-015**: The system MUST prevent duplicate real orders arising from a single ordering intent (e.g. re-confirmation/re-submission).
- **FR-016**: Phase 1 MUST support exactly one item per order.

#### Product, design, and address collection

- **FR-017**: The system MUST let the seller select an in-stock SKU and MUST NOT allow ordering an out-of-stock SKU.
- **FR-018**: The system MUST advise the seller of the product's artwork/file requirements before they upload a design.
- **FR-019**: Sellers MUST be able to upload a design image (and optionally a mockup image) and have it become a public URL usable on the order; front and optional back artwork MUST be supported.
- **FR-020**: The system MUST validate uploaded files are images and within an allowed size limit, rejecting others with a clear reason.
- **FR-021**: The system MUST collect and validate a shipping address (recipient name, address line 1, city, state, postal code, country; optional address line 2, email, phone), requiring a 2-letter state code for US orders and a valid country code, re-asking for any missing/invalid field.
- **FR-022**: A real order MUST NOT proceed unless a valid design URL is present for the item.

#### Order management

- **FR-023**: Sellers MUST be able to retrieve an order's status/details and its tracking information; when tracking is unavailable, the system MUST say so clearly.
- **FR-024**: Sellers MUST be able to cancel and delete an order, each requiring explicit confirmation, with the result reported back.

#### Conduct & data integrity

- **FR-025**: The agent MUST NOT invent order data, prices, SKUs, tracking, or balances; on an upstream error it MUST tell the seller it could not complete the action rather than fabricating a result.

### Key Entities *(include if feature involves data)*

- **Seller API Key**: the seller's own BurgerPrints credential, stored encrypted and associated with a seller account; exposed only as a configured/last-4 status.
- **Order Draft**: an ephemeral sandbox order used only to preview cost (base, shipping, total); not a real order and discarded after preview.
- **Order**: a real fulfillment order on the seller's account, with an order id, state (created/paid/cancelled), one item, shipping address, artwork URLs, and amounts (base, shipping, total).
- **Uploaded Asset**: a design or mockup image uploaded by the seller and hosted as a public URL, referenced by an order item (front and optional back).
- **Wallet Balance**: the seller's BurgerPrints account balance, read before charging.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A logged-in seller with a configured key can complete an end-to-end real, paid order (single item) through chat in under 5 minutes for a known SKU.
- **SC-002**: 100% of real-order and charge actions are preceded by an explicit seller confirmation (no real order or charge ever occurs without one).
- **SC-003**: 100% of guests attempting to start an order are stopped and prompted to log in (no order details collected while unauthenticated).
- **SC-004**: 0 occurrences of a seller's API key appearing in logs or in any response body (full key never exposed).
- **SC-005**: Every real order is preceded by a cost preview that shows base cost, shipping fee, and total.
- **SC-006**: A single ordering intent never results in more than one real order (no duplicates from re-confirmation).
- **SC-007**: Image uploads of disallowed type or excessive size are rejected 100% of the time with a clear reason.
- **SC-008**: When wallet balance is insufficient, charging never succeeds and the seller is informed every time.

## Assumptions

- The seller's account already exists and authentication is handled by the existing auth system; "logged in" maps to an authenticated (non-guest) chat session.
- Each seller who places real orders has their own BurgerPrints fulfillment store and API key; the platform's shared key is used only for sandbox drafts and catalog lookups.
- The object storage service for design/mockup images is Cloudflare R2 (S3-compatible); all credentials and bucket/endpoint/public-base values are supplied via environment variables and never committed to source.
- The fulfillment provider supports create (with a sandbox flag), charge, balance, order detail, tracking, cancel, and delete operations; exact response shapes for tracking/charge/cancel are verified against the live/sandbox provider during implementation.
- Shipping fee for a destination is only available by creating a (sandbox) draft order; there is no separate shipping-rate endpoint, so the draft is the source for the previewed shipping fee.
- Phase 1 is single-item; multi-item orders, editing an existing order's items, and webhook-driven status updates are out of scope.
- Existing chat/tool/streaming infrastructure (agent tools, server-sent streaming, session model) is reused; the new "action" signal to the frontend extends the existing streaming channel.
- A single platform-wide encryption secret (from the environment) is used to encrypt seller API keys at rest.
