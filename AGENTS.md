<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan.
Current plan: `specs/019-email-delivery-runtime/plan.md`.
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
