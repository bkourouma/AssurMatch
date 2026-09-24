# Implementation Plan: Central AI Gateway And Visitor Assistance

**Branch**: `034-ai-core-visitor-assistance` | **Date**: 2026-09-05 | **Spec**: `specs/034-ai-core-visitor-assistance/spec.md`

**Continuous Workflow Eligibility**: Eligible.

## Summary

Build the single, audited AI gateway the constitution requires (flags, minimization, prompts, provider port, guardrails, quotas, persistence, fallback) and expose the first visitor-facing assistances on it, asynchronously, with a deterministic template provider by default and the official Anthropic SDK as the optional model provider.

## Technical Context

**Provider**: `AiProviderPort.generate({ assistType, system, user, maxOutputTokens, json })`. `TemplateAiProvider` (default) is deterministic and offline; `AnthropicAiProvider` uses `@anthropic-ai/sdk` with `claude-opus-5` (env `ASSURMATCH_AI_MODEL`), `output_config.effort=low`, `max_tokens` 2048 (assistance outputs are short by design and quota-capped), server-side `fallbacks: "default"` (beta) unless disabled by env.
**Storage**: `AIInteraction` extended; memory + Prisma repositories.
**Async**: public assist calls are queued (`ai-assist` queue) and processed in-process after the response (memory queue), tests call `processPending()`.
**Quotas**: Redis daily counters per surface key (visitor IP 40/day, broker tenant by plan, admin actor) plus hourly public rate limit.

## Constitution Check

- **Platform role**: Pass (disclaimer + guardrails).
- **Regulatory/consent**: Pass (no PII sent; minimizer + schema restrictions).
- **Feature flags**: Pass (global + country + product + partner opt-out + plan; all off by default).
- **Frontend separation**: Pass.
- **Security/RBAC**: Pass (rate limit, quotas, capability-scoped reads, no secrets in responses).
- **Data history**: Pass (interaction rows + audit).
- **Tests**: Pass.

## Design

1. Contracts and Prisma extension.
2. `PiiMinimizer.minimize(input)` -> `{ minimized, report }` (key-based + pattern-based redaction).
3. `AiGuardrails.evaluate(assistType, text)` -> `{ approved, reasons }` and `AiGuardrails.decorate(text)` appends the disclaimer when absent.
4. `AiPromptLibrary.build(assistType, minimizedInput, context)` -> `{ system, user, json }` with French, non-advisory instructions.
5. `AiGateway.run(request, { wait })` orchestrates policy -> quota -> minimize -> prompt -> persist queued -> execute -> guardrails -> persist -> audit; `processPending()` for tests; `execute` uses provider with fallback to template.
6. `VisitorAiService` maps public requests to gateway calls with country/product flag resolution and IP rate limiting.
7. HTTP wiring + public app component.

## Risks

- Template provider outputs are intentionally simple; they exist so the product works and is testable without a model key.
- Daily quotas are per process in memory-Redis test mode; Redis-backed in runtime.
