# Implementation Plan: Manual Order UI

**Branch**: `007-manual-order-ui` | **Date**: 2026-06-06 | **Spec**: [spec.md](../spec.md)

**Input**: Feature specification from `/specs/007-manual-order-ui/spec.md`

## Summary

Implement a 3-step manual order creation wizard in the React frontend, supported by a NestJS backend endpoint to calculate dynamic shipping costs based on weight/region and submit the final order to the BurgerPrints Sandbox API.

## Technical Context

**Language/Version**: TypeScript, React (Frontend), NestJS (Backend)

**Primary Dependencies**: Vite, TailwindCSS, React (Frontend), NestJS, Axios/Fetch (Backend)

**Storage**: PostgreSQL (assumed for order/draft persistence, though MVP might just pass through)

**Testing**: Jest (Backend), Vitest/React Testing Library (Frontend)

**Target Platform**: Web Browser

**Project Type**: Web Application (Frontend + Backend)

**Performance Goals**: Fast UI navigation between steps, < 1s API response for cost calculation

**Constraints**: Must integrate with BurgerPrints API in sandbox mode

**Scale/Scope**: Core MVP flow for 1 manual order at a time

## Constitution Check

*GATE: Passed.*
No specific constitution constraints violated. The project uses standard Frontend + Backend separation.

## Project Structure

### Documentation (this feature)

```text
specs/007-manual-order-ui/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── burgerprints/
│   │   ├── dto/
│   │   ├── burgerprints-tool.service.ts
│   │   └── burgerprints.controller.ts
│   └── orders/
│       ├── dto/
│       ├── orders.service.ts
│       └── orders.controller.ts

frontend/
├── src/
│   ├── components/
│   │   └── ManualOrderWizard/
│   │       ├── Step1Products.tsx
│   │       ├── Step2Shipping.tsx
│   │       └── Step3Finalize.tsx
│   ├── pages/
│   │   └── CreateOrderPage.tsx
│   └── services/
│       └── api.ts
```

**Structure Decision**: Option 2: Web application. The feature will be split into a new React wizard component in the frontend, and new endpoints in the backend `orders` or `burgerprints` modules.

## Complexity Tracking

No violations to track.
