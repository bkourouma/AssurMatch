# Implementation Plan: Local App Launcher Browser Validation

**Branch**: `021-local-app-launcher-browser-validation` | **Date**: 2026-05-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-local-app-launcher-browser-validation/spec.md`

**Continuous Workflow Eligibility**: Eligible. The user explicitly approved this standard local developer/runtime hardening feature for continuous specify, plan, tasks, implementation, validations and local commit. The spec has no `[NEEDS CLARIFICATION]` markers.

## Summary

Replace the older ad hoc local launcher with a reproducible Windows-oriented local stack: Docker Compose local PostgreSQL/Redis/Mailpit, API on `3600`, public app on `3601`, admin back-office on `3602`, broker back-office auxiliary on `3603`, Mailpit on `8025`, safe runtime env, migrations, seed, health checks, opt-in browser smoke and quickstart documentation. No regulated product module or real operational data is activated.

## Technical Context

**Language/Version**: TypeScript strict on Node >=24.15.0, Next.js 16, NestJS 11, Prisma 7, Playwright 1.59, Docker Compose and Windows PowerShell.
**Primary Dependencies**: Existing Node runtime, `tsx`, Prisma CLI, Next.js CLI, Docker Compose, Playwright. No new npm dependency is required.
**Storage**: Local/dev PostgreSQL database `assurmatch`; Redis local/dev for runtime cache/queues; Mailpit local SMTP/UI. Existing Prisma seed remains synthetic and internal.
**Testing**: Unit/static tests through the default suite, opt-in Playwright browser smoke for running local servers, local health command, final validation commands requested by the user.
**Target Platform**: Windows developer machines plus CI-compatible command wrappers where possible.
**Impacted Application(s)**: Multiple scopes: Backend API launcher/runtime env, Web Publique Client local server, Back-office Partenaires/Plateforme local servers, local Docker infrastructure, docs and tests.
**Project Type**: B2B2C regulated marketplace web application.
**Performance Goals**: Local health check should fail fast per URL; launcher should wait for infrastructure ports before migrations and app starts.
**Constraints**: Do not merge public/back-office apps; do not use `NODE_ENV=test` for the full local app; do not commit secrets; do not activate payment, policy issuance, e-signature, claims, insurer API or AI recommendation.
**Scale/Scope**: One local developer stack with documented ports and opt-in browser validation. No production deployment or CI pipeline refactor.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Technical platform role**: Pass. The feature launches existing technical surfaces locally and does not create direct sale, subscription, premium collection, policy issuance, attestation or advice.
- **Regulatory and consent**: Pass/N/A. No lead submission or transmission is added. Browser smoke loads quote form surfaces only.
- **Feature flags and activation**: Pass. Existing seed keeps regulated flags disabled; launcher does not flip flags.
- **Frontend application separation**: Pass. Public app remains on `3601`; admin and broker back-office apps remain separate from public and require auth on protected routes.
- **Security and RBAC**: Pass. Protected routes redirect unauthenticated users. Bootstrap admin is documented with operator-provided credentials and existing production refusal.
- **Data and auditability**: Pass. Local seed remains synthetic/internal. Bootstrap admin uses existing audit actions.
- **Routing integrity**: Pass/N/A. No routing decision changes.
- **AI control**: N/A. No AI call, prompt, recommendation or AI flag activation.
- **UX and content safety**: Pass. No new commercial public wording or forbidden CTA is introduced.
- **Testing discipline**: Pass. Adds health checks and opt-in Playwright browser smoke for public and back-office surfaces.
- **Async and reliability**: Pass. Redis and Mailpit are local/dev dependencies; no new async workload is introduced.
- **Continuous workflow safety**: Pass. User explicitly approved continuous workflow and local commit after validations.

## Project Structure

### Documentation (this feature)

```text
specs/021-local-app-launcher-browser-validation/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/local-app-launcher.md
  tasks.md
  checklists/requirements.md
docs/
  local-app-quickstart.md
```

### Source Code (repository root)

```text
launch-local.bat
stop-local.bat
docker-compose.yml
package.json
scripts/local-app/
  api-runner.mjs
  launch-local.ps1
  stop-local.ps1
  local-health.mjs
  local-browser-smoke.mjs
apps/public/tests/
  local-app-launcher-browser.spec.ts
```

**Structure Decision**: Keep Windows entry points at repository root for operator familiarity, move implementation details into `scripts/local-app/`, keep public and back-office browser smoke in Playwright while making live-server checks opt-in.

## Complexity Tracking

No constitutional violations or exceptions are required.

## Post-Design Constitution Check

- **Security/data leakage**: Pass. Scripts use synthetic local credentials already scoped to development, do not set bootstrap passwords, and docs require operator-provided secrets.
- **Frontend separation**: Pass. Admin `3602` and broker auxiliary `3603` remain separate from public `3601`; public smoke checks route separation.
- **Regulated activation**: Pass. Migrations/seed do not enable forbidden modules.
- **Testing**: Pass. Health script and opt-in browser smoke validate local visibility without breaking default CI/web tests.
