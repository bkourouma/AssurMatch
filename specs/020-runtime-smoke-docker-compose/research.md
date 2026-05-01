# Research: Runtime Smoke Docker Compose

## Decision: Dedicated Compose File

Use `docker-compose.runtime-smoke.yml` instead of extending the existing
`docker-compose.yml`.

**Rationale**: The existing local compose file maps PostgreSQL to `5432` and
Redis to `6379`, which is exactly the class of conflict this feature must avoid.
A dedicated file makes the smoke lifecycle explicit, keeps service names and
volumes recognizable, and prevents accidental coupling with local development
state.

**Alternatives considered**:
- Reuse `docker-compose.yml`: rejected because it preserves `5432`/`6379`
  defaults and can collide with Windows PostgreSQL.
- Require a manually provisioned database: rejected because it is not
  reproducible enough for CI and new local machines.

## Decision: Non-Standard Smoke Ports

Expose PostgreSQL on `55432` and Redis on `56379` by default.

**Rationale**: These ports avoid the conventional local service ports and match
the user acceptance criteria. They remain easy to identify as PostgreSQL/Redis
variants without hiding the service purpose.

**Alternatives considered**:
- Random ports: rejected because docs and CI become less predictable.
- Standard ports: rejected because the 019 failure came from a standard-port
  collision.

## Decision: Guardrail in Existing Smoke Env Module

Harden `backend/tests/runtime-postgres/runtime-postgres-smoke-env.ts` and cover
it with a focused Vitest spec.

**Rationale**: The existing smoke runner already centralizes environment
validation before migrations and runtime startup. Tightening this file avoids a
second validation path and ensures direct calls to `npm run test:runtime:postgres`
receive the same protections as the new lifecycle script.

**Alternatives considered**:
- Guard only in npm wrapper scripts: rejected because direct execution of the
  existing smoke command would bypass the checks.
- Put guardrails in application runtime config: rejected because this is a
  smoke-test safety contract, not production application behavior.

## Decision: Cross-Platform Node Scripts

Use small Node `.mjs` scripts under `scripts/runtime-smoke/` for up, down and
run lifecycle commands.

**Rationale**: The repository already requires Node, and Node scripts work in
Windows PowerShell and GitHub Actions without requiring Bash. They can call
`docker compose`, set child-process environment safely and avoid shell-specific
env syntax.

**Alternatives considered**:
- PowerShell-only scripts: rejected because CI runners may be Linux-based.
- Shell-only scripts: rejected because the user requested Windows PowerShell
  support when possible.

## Decision: No CI Workflow Refactor

Document GitHub Actions usage instead of adding or changing workflow files.

**Rationale**: The requested scope allows CI support if pertinent but excludes a
global CI/CD refactor. Npm scripts plus quickstart commands are enough for a
future workflow to consume.

**Alternatives considered**:
- Add a full GitHub Actions job: rejected as broader than necessary and not
  required to prove the local/CI command contract.
