# Research: Local App Launcher Browser Validation

## Decision: Use PowerShell-backed Windows launch and stop scripts

**Rationale**: The repository already exposes `launch-local.bat` and `stop-local.bat` at the root. Keeping those as wrappers preserves operator muscle memory while moving quoting-heavy process logic into PowerShell.

**Alternatives considered**: Keeping all logic in batch was rejected because env quoting, hidden processes and log capture are fragile. A Node-only launcher was rejected because Windows process cleanup and Docker prerequisites are clearer in PowerShell.

## Decision: Keep admin and broker back-office as separate local servers

**Rationale**: The constitution requires public visitor journeys and partner/admin journeys to remain applicatively separated. The codebase has separate `apps/admin` and `apps/broker` Next.js apps. The primary required Back-office URL is `3602` for admin/platform; broker smoke uses auxiliary `3603`.

**Alternatives considered**: Merging admin and broker into one local Next.js app was rejected as a scope and separation risk.

## Decision: Docker Compose provides local/dev PostgreSQL, Redis and Mailpit

**Rationale**: Existing `docker-compose.yml` already defines local PostgreSQL, Redis, MinIO and Mailpit. This feature adds health checks and launcher orchestration rather than a second local compose file.

**Alternatives considered**: Reusing runtime-smoke compose was rejected because it uses disposable smoke ports and database names intended for tests, not the ordinary local/dev app.

## Decision: Browser smoke is opt-in

**Rationale**: Live browser smoke requires local servers to be running. Keeping it disabled unless explicitly enabled lets `npm run test:web` continue passing in clean CI or developer shells while still providing a real local validation command.

**Alternatives considered**: Always running live browser smoke was rejected because it would fail when no local stack is launched.
