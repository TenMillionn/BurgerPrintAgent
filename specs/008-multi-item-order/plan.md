# Implementation Plan: Multi Item Order Schema & UI

**Branch**: `[008-multi-item-order]` | **Date**: 2026-06-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-multi-item-order/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement a multi-item capable Manual Order creation wizard in the React frontend, supported by new NestJS backend catalog endpoints. Users can configure products, fulfillment partners, color/size variants, and provide raw URLs for designs, all mapped identically to the `CreateOrderPayload` schema.

## Technical Context

**Language/Version**: TypeScript (Node.js backend, React frontend)

**Primary Dependencies**: NestJS, React, Tailwind CSS

**Storage**: MongoDB (Mongoose)

**Testing**: Jest (Backend), Vitest (Frontend)

**Target Platform**: Web Browser

**Project Type**: Full-stack Web Application

**Performance Goals**: < 500ms response times for catalog endpoints

**Constraints**: MVP scope (no file uploads for designs, just raw URLs)

**Scale/Scope**: Dozens of products, multiple variants per product

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Test-First (NON-NEGOTIABLE)**: Ensure endpoints are tested, but since this is an MVP UI integration, focus on verifying the payload structure in e2e/unit tests.
- **Simplicity**: Kept simple by directly exposing existing Service methods via new controller routes rather than building complex proxy layers.

## Project Structure

### Documentation (this feature)

```text
specs/008-multi-item-order/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   └── orders/
│       ├── orders.controller.ts    # New GET catalog endpoints
│       └── orders.service.ts       # Service methods mapping to BurgerPrintToolService
└── tests/

frontend/
├── src/
│   ├── components/
│   │   └── ManualOrderWizard/
│   │       ├── OrderContext.jsx    # Update state for array of items
│   │       ├── ItemsStep.jsx       # Update for multi-item UI & design URLs
│   │       └── ...
│   └── services/
│       └── api.js                  # Fetch wrappers for new endpoints
└── tests/
```

**Structure Decision**: Extending the existing Option 2 (Web application) architecture by adding routes to the existing `orders` module on the backend and updating the existing wizard components on the frontend.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Array Context State | FR-009 Multi-item UI | Single item state rejected because users must be able to add multiple items per the clarified requirements. |
