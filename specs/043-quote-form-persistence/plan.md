# Implementation Plan: Quote Form Definition Persistence and Administration

**Spec**: `specs/043-quote-form-persistence/spec.md`
**Impacted surfaces**: Backend API, database / Prisma (read path only), shared packages, Back-office Plateforme.
**Blocked on**: nothing. D1 (RBAC split) is the only decision worth confirming before step 4; steps 1-3 are independent of it.

## Sequencing rationale

Persistence comes before the HTTP route, and the route before the screen. The reverse order would expose a create endpoint writing to an array that disappears with the process - a worse failure than today's, because it would look like it worked.

The runtime-repository assertion is wired in step 1, not last. It is the guard that makes this defect impossible to reintroduce, and adding it early means every subsequent step runs against a runtime that refuses the memory repository outside tests.

1. **Repository.** `QuoteFormDefinitionsRepository` interface, memory implementation (test-only) and Prisma implementation, modelled on `consent-records.repository.ts`. Registered in `runtimeRepositoryModes()` and guarded by `assertRuntimeRepository`. Includes `validationSchema` passthrough so the repository is not lossy.
2. **Service goes async.** `create`, `publish`, `retire`, `list`, `require` return promises; `publicForm` keeps its signature. Update the seventeen call sites, the most consequential being `activation-checklist.service.ts` whose `forms` parameter is typed `ReturnType<QuoteFormDefinitionService["list"]>` and becomes `Awaited<...>`. Tests first, so the async migration is proven before any behaviour changes.
3. **Publish invariants + atomic version swap.** The ordered checks from the spec, each with its own audited reason; publishing retires the previous published definition for the triple in one transaction. Unit tests per invariant, plus the partial-failure case from scenario 3.
4. **HTTP wiring + RBAC (D1).** The four admin routes in `runtime-http-wiring.module.ts`, with the authoring/publishing role split and `admin_pays` country scoping. Error wording chosen deliberately for `error-response.filter.ts`: `forbidden_role` and `out_of_scope_country` must map to 403, `published_consent_text_missing` to 422, and the regex order means the chosen words matter more than their meaning.
5. **Admin screen.** Replace the stub with list, create, publish and retire, stating plainly that publishing exposes the form publicly and binds the consent text version. Source tests for wording and for the presence of the publish confirmation.
6. **Close the blind spot.** `runtime-postgres-smoke-seed.ts` seeds its form over HTTP instead of in-process; `local-health.mjs` asserts a rendered field rather than the page heading. Without this step the suite stays able to be green while the journey is dead.
7. **Preprod reference seed** gains the two published definitions so a fresh environment is not born blocked.
8. `npm run validate`, Playwright, `npm run test:runtime:postgres:docker`, then the manual local journey through to Mailpit. Tick tasks, update `docs/prd_coverage_map.md`.

## Risks

- **Wide async ripple.** Seventeen files reference the service. The risk is a missed `await` in a synchronous branch reading as an empty list rather than failing - silent, and exactly the shape of the original defect. Mitigated by making the repository assertion active from step 1 and by typing `list()` as returning a promise so the compiler finds every site.
- **Publish atomicity.** If the retire-then-publish pair is not transactional, a failure leaves a triple with zero published definitions and the public form disappears. Scenario 3 tests the partial failure explicitly.
- **RBAC split friction (D1).** Requiring `compliance_admin` to publish slows routine catalogue work. That is the intended trade-off; if the organisation is too small for the split, collapsing both into `super_admin` + `content_admin` is a one-line change to the role sets, but it should be a recorded decision rather than a drift.
- **Seeds already write to the table.** Once the repository reads it, previously inert rows become live. The local demo seed's two published definitions will start being served. That is the desired outcome, but it means the first run after this change alters local behaviour without any seed change - worth saying out loud in the task notes.
- **Green suite, dead journey.** The deepest risk is leaving step 6 out. Every other step could ship and the test suite would prove nothing about the path a real operator takes.
