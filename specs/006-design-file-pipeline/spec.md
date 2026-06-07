# Feature Specification: Design Print-File Pipeline

**Feature Branch**: `006-design-file-pipeline`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "When the agent needs a print file it must render an upload card; the seller uploads front/back images (stored with conversation + side + agent-message metadata); the agent validates the resolution against an allowed list; if invalid it offers auto resize/crop via a 'Process now' button; processing returns corrected front/back images shown in chat; the order always uses the latest image in the conversation, and if the seller objects the agent lists the conversation's images to choose from."

## Overview

Feature 005 lets a seller place an order but treats the design as any image URL. Real print-on-demand fulfillment requires the artwork to be an exact, factory-accepted resolution. This feature turns "give me a design" into a guided, validated pipeline: the agent renders an in-chat **upload card** (never just asks in text), the seller uploads front/back files, each upload is **stored with metadata** (which conversation, which side, which agent message it belongs to), the agent **validates** the resolution against the allowed list, and when it doesn't match the agent offers a **one-tap auto resize/crop** that returns corrected images rendered back in the chat. Ordering always uses the **most recent** image per side, with a fallback to **pick from the conversation's images** if the seller wants a different one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload a print file via the in-chat card (Priority: P1)

When the agent needs a print file, it renders an upload card; the seller selects a file and uploads it, sees a loading state, then a success confirmation; the image is stored against the conversation and side.

**Why this priority**: Nothing downstream (validation, processing, ordering) can happen without a stored, attributed upload. It is the foundation.

**Independent Test**: Ask the agent to start an order needing a front design → an upload card appears → upload a file → loading → success message "Upload front success", and the image is retrievable for this conversation tagged side=front.

**Acceptance Scenarios**:

1. **Given** the agent needs a print file, **When** it asks for it, **Then** it renders an upload card (not a plain text request) for the relevant side.
2. **Given** an upload card, **When** the seller picks a file and uploads, **Then** a loading state shows and on success the chat confirms "Upload front success" / "Upload back success".
3. **Given** a successful upload, **When** it is stored, **Then** it records the conversation, the side (front/back), the referencing agent message, the uploader, the public URL, and the image's pixel dimensions.

---

### User Story 2 - Validate the print resolution (Priority: P1)

The agent checks an uploaded image's resolution against the allowed factory resolutions and tells the seller whether it is valid.

**Why this priority**: An order must not be placed with an invalid print file; validation is the gate that decides whether processing is needed.

**Independent Test**: Upload an image whose WxH is in the allowed list → agent says it's valid; upload one that is not → agent says it's not a valid print size and offers to fix it.

**Acceptance Scenarios**:

1. **Given** an uploaded image whose dimensions match an allowed resolution, **When** the agent validates it, **Then** it reports the file is valid.
2. **Given** an uploaded image whose dimensions do NOT match any allowed resolution, **When** the agent validates it, **Then** it tells the seller the size is invalid, proposes auto resize/crop, and shows a "Process now" button.

---

### User Story 3 - Auto resize/crop an invalid file (Priority: P1)

When the seller confirms, the system resizes/crops the uploaded image(s) to a valid resolution and shows the corrected image(s) in the chat.

**Why this priority**: Without an automatic fix, an invalid upload is a dead end; this is what makes validation actionable.

**Independent Test**: With an invalid upload, click "Process now" → the chat shows a corrected image at a valid resolution, stored as a new image for the conversation.

**Acceptance Scenarios**:

1. **Given** an invalid upload and the seller clicking "Process now", **When** processing runs, **Then** the image is resized/cropped to a valid allowed resolution and the corrected image is shown in the chat and stored.
2. **Given** both a front and back invalid upload, **When** processing runs, **Then** both corrected images are returned and shown.
3. **Given** processing finished, **When** the agent validates the corrected image, **Then** it now matches an allowed resolution.

---

### User Story 4 - Choose which image to order with (Priority: P2)

Ordering uses the most recent uploaded image per side by default; if the seller says that's not the one, the agent lists the conversation's images so they can choose.

**Why this priority**: Sensible default keeps the happy path fast; the chooser is a recovery path, so slightly lower priority.

**Independent Test**: Upload two front images → place an order → the latest one is used; say "not that one" → the agent lists this conversation's front images for selection.

**Acceptance Scenarios**:

1. **Given** multiple uploads for a side, **When** an order is placed, **Then** the most recent valid image for that side is used by default.
2. **Given** the seller says the chosen image is wrong, **When** they ask to change it, **Then** the agent lists the conversation's uploaded images (per side, newest first) for them to pick.

---

### Edge Cases

- Upload of a non-image or oversized file → rejected with a clear reason; no asset stored.
- Image dimensions cannot be read (corrupt file) → rejected; agent asks for another file.
- Source aspect ratio far from any allowed resolution → processing still picks the closest allowed size; the agent notes that cropping was applied.
- Seller uploads a new file after processing → the newest upload becomes the default for ordering.
- Seller asks to order before uploading / while the only upload is invalid → the agent blocks the real order and requests/fixes the file first.
- Guest (not logged in) → upload is not available; the agent asks them to log in (consistent with feature 005's auth gate).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the agent needs a print file, it MUST render an in-chat upload card for the required side(s) rather than only asking in text.
- **FR-002**: The upload card MUST let the seller select a file, show a loading state during upload, and confirm success; on success the chat MUST post "Upload front success" / "Upload back success" for the relevant side.
- **FR-003**: Each uploaded image MUST be stored with metadata: conversation, side (front/back), the agent message it is attached to, the uploader, the public URL, and pixel dimensions (width × height).
- **FR-004**: Uploaded files MUST be validated as images within an allowed size limit; invalid files are rejected with a clear reason and not stored.
- **FR-005**: The system MUST be able to validate an image's resolution against the allowed factory resolution list and report valid/invalid plus the detected dimensions.
- **FR-006**: When an image is invalid, the agent MUST inform the seller, propose auto resize/crop, and present a "Process now" button.
- **FR-007**: On confirmation, the system MUST resize/crop the image(s) to a valid allowed resolution (choosing the closest by aspect ratio), store the result as a new image, and show the corrected image(s) in the chat.
- **FR-008**: A corrected (processed) image MUST itself validate as an allowed resolution.
- **FR-009**: The agent MUST be able to process front and back together when both need fixing, returning both corrected images.
- **FR-010**: When selecting the design for an order, the system MUST default to the most recent valid image per side in the conversation.
- **FR-011**: If the seller indicates the default image is wrong, the agent MUST be able to list the conversation's uploaded images (per side, newest first) so the seller can choose.
- **FR-012**: A real order MUST NOT proceed unless the chosen front print file is a valid (allowed) resolution.
- **FR-013**: Buttons/cards rendered for this flow MUST follow the chat UX rule that they only remain actionable on the agent's latest message.
- **FR-014**: The agent MUST NOT fabricate dimensions, validation results, or processed images; on an error it MUST tell the seller it could not complete the step.

### Allowed print resolutions (WxH, pixels)

4800x5400, 2100x2400, 4200x4800, 2400x3200, 2800x3200, 4500x5400, 2400x3197, 4050x4650, 3000x4000, 4500x5000, 3600x4795, 4050x4050, 3600x4800, 4500x5100, 2935x3374, 2953x3374, 4535x5480, 4500x4200, 4500x3600, 4500x5700, 4500x5143, 3400x4500, 3951x4919, 4500x5600, 3692x4800.

### Key Entities *(include if feature involves data)*

- **Design Asset**: an uploaded or processed print image. Attributes: conversation, uploader, side (front/back), public URL, width, height, valid (matches an allowed resolution), processed (true if produced by resize/crop), source asset (if processed from another), the agent message it is attached to, created time.
- **Allowed Resolution**: a (width, height) the factory accepts; the fixed validation set above.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When the agent needs a print file, an upload card is rendered 100% of the time (never a text-only request).
- **SC-002**: 100% of stored design assets carry conversation + side + agent-message + dimensions metadata.
- **SC-003**: Validation correctly classifies an image as valid only when its dimensions exactly match an allowed resolution (0 false "valid").
- **SC-004**: After "Process now", the resulting image matches an allowed resolution 100% of the time.
- **SC-005**: An order placed without a valid front print file is blocked 100% of the time.
- **SC-006**: By default an order uses the most recent valid image per side; the seller can switch to any other image from the same conversation.
- **SC-007**: Non-image or oversized uploads are rejected 100% of the time with a clear reason.

## Assumptions

- Object storage (Cloudflare R2) and the authenticated chat session from feature 005 are reused; uploads require a logged-in seller.
- "Agent message it is attached to" is the assistant turn that rendered the upload card; it is referenced by a stable per-turn reference (and linked to the persisted message where available).
- Processing fixes resolution by choosing the allowed size closest in aspect ratio and applying a cover resize + center crop; exact crop strategy is an implementation detail.
- Mockups are out of scope here; this feature is about the print (design) file. Multi-item orders remain out of scope (feature 005 phase 1).
- The allowed resolution list is fixed in code for now (not admin-managed).
