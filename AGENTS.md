<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan.
Current plan: `specs/025-broker-backoffice-ux-polish/plan.md`.
Before any Spec Kit workflow, read `.specify/memory/constitution.md`; it is the
authoritative source for AssurMatch product, regulatory, security, data, AI,
routing, testing and activation constraints.
Future specs must explicitly state impacted surfaces: Web Publique Client,
Back-office Partenaires/Plateforme, Backend API, shared packages, or multiple
scopes. Public visitor journeys and authenticated partner/admin journeys must
remain separated applicatively.
When a standard feature spec is validated, committed or explicitly approved and
contains no `[NEEDS CLARIFICATION]`, Code AI may continue through
`/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement` -> final
validations without intermediate confirmation. Stop for constitutional conflict,
major ambiguity, compliance/security/data leakage risk, forbidden activation,
uncovered product decision or blocking validation failure. Never auto-commit
after implementation unless the user explicitly asks.
<!-- SPECKIT END -->

<!-- ASSURMATCH AGENTIC SUPERVISION START -->

# AssurMatch Codex Supervisor Operating Model

## Core model

The root Codex thread is the supervisor / lead engineer.

The supervisor owns:
- understanding the selected Spec Kit spec
- deciding whether the spec is ready
- assigning bounded work to subagents
- merging subagent findings
- making final implementation decisions
- validating the result
- reporting risks and remaining TODOs

Subagents are helpers. They do not own final product decisions.

## Mandatory context before any feature/spec work

Before planning, task generation, implementation, review, or validation, the supervisor must read:

1. `.specify/memory/constitution.md`
2. the selected spec directory under `specs/`
3. `spec.md`, `plan.md`, `tasks.md`, `contracts/`, `data-model.md`, `research.md`, and `quickstart.md` when present
4. the relevant app/package source files
5. local runtime instructions when runtime/browser validation is needed

The constitution is authoritative over all specs, implementation plans, prompts, and subagent output.

## Spec selection rules

If the user names a spec number, work only on that spec.

If the user says "current spec", use the current Speckit plan pointer from the `<!-- SPECKIT START -->` block.

If the user says "next spec" or the target is ambiguous:
- inspect `specs/`
- identify likely incomplete or active specs
- propose the next target
- stop for user confirmation before implementation

Never implement across multiple specs unless the user explicitly asks.

## Impacted surfaces must always be stated

Every plan and final report must explicitly identify impacted surfaces:

- Web Publique Client
- Back-office Partenaires / Plateforme
- Broker Back-office
- Backend API
- shared packages
- database / Prisma / migrations
- runtime / Docker / local launcher
- multiple scopes

Public visitor journeys and authenticated partner/admin/broker journeys must remain separated applicatively.

## Delegation policy

For simple single-surface changes, the supervisor may work directly.

For multi-surface, compliance-sensitive, auth-sensitive, data-sensitive, AI/routing-sensitive, database, or runtime changes, the supervisor should spawn subagents.

Preferred subagent usage:

- `spec_auditor`: read-only spec readiness, scope, dependencies, ambiguity, task order
- `security_constitution`: read-only constitution, auth, regulatory, data leakage, AI/routing, activation risk review
- `qa_validator`: read-only acceptance criteria, test gaps, regression risk, validation commands
- `platform_backend`: backend/API/database/shared package implementation
- `backoffice_ux`: platform/admin/partner/broker back-office UX implementation
- `public_web`: public client web implementation
- `local_runtime`: local launcher, health checks, browser/runtime smoke checks

## Parallelism rules

Parallelize read-only work aggressively:
- spec audit
- security review
- QA review
- codepath mapping
- local runtime investigation

Be conservative with write work:
- avoid multiple write agents editing the same files
- avoid multiple write agents editing related frontend/backend contracts at the same time
- prefer one implementation owner per surface
- supervisor must review and reconcile final diffs

The supervisor must wait for subagents and consolidate their outputs before finalizing.

## Speckit workflow

For a standard validated feature spec with no `[NEEDS CLARIFICATION]`, and no constitutional conflict, Codex may continue through:

1. `/speckit.plan`
2. `/speckit.tasks`
3. `/speckit.implement`
4. validation
5. final report

Stop before continuing when there is:
- constitutional conflict
- major ambiguity
- compliance/security/data leakage risk
- forbidden activation
- uncovered product decision
- AI/routing risk
- authentication or authorization uncertainty
- migration/data-loss concern
- blocking validation failure
- unclear impacted surface

Never auto-commit unless the user explicitly asks.

## Local runtime expectations

When local runtime validation is needed, use the project local launcher from the repository root:

```powershell
cmd /c launch-local.bat
```

Expected local services:

- API: `http://localhost:3600`
- Web Publique Client: `http://localhost:3601`
- Back-office Plateforme/Admin: `http://localhost:3602`
- Broker Back-office: `http://localhost:3603`
- Mailpit: `http://localhost:8025`

Useful checks:

```powershell
npm run local:health
npm run test:web:local
```

Stop local services without deleting volumes:

```powershell
cmd /c stop-local.bat
```

The broker back-office remains a separate authenticated app and must not be merged with the public web app.

## Validation expectations

Before final response, the supervisor should run the smallest relevant validation set, such as:

- typecheck
- lint
- unit tests
- integration tests
- `npm run local:health`
- `npm run test:web:local`
- targeted browser/runtime smoke checks

If a validation cannot be run, explain why and give the exact command the user should run.

## Final response format

Every implementation final response must include:

1. Target spec
2. Impacted surfaces
3. Subagents used
4. Files changed
5. Behavior implemented
6. Commands run
7. Validation result
8. Risks / limitations
9. Recommended next task

<!-- ASSURMATCH AGENTIC SUPERVISION END -->

