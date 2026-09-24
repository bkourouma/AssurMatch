# Tasks: Central AI Gateway And Visitor Assistance

**Impacted surfaces**: Backend API, database / Prisma / migrations, shared packages, Web Publique Client.

- [x] T001 Contracts `ai.contracts.ts` (assist types, interaction DTO, visitor requests) + index export; extend `aiAssistTypeSchema`.
- [x] T002 Prisma `AIInteraction` extension + migration `0011_ai_interactions` + migrations test.
- [x] T003 Core: minimizer, guardrails, prompts, provider port + template provider, Anthropic provider (official SDK), config; unit tests.
- [x] T004 Interactions repository (memory/Prisma) + `AiGateway` (policy, quota, persistence, audit, fallback); unit tests.
- [x] T005 `VisitorAiService` + public HTTP endpoints (async + poll) + runtime wiring; integration tests.
- [x] T006 Quote AI summary through the gateway; status endpoints report computed `enabled`.
- [x] T007 Public app `VisitorAiAssistant` (product page + quote form); source tests.
- [x] T008 Validate; tick tasks.
