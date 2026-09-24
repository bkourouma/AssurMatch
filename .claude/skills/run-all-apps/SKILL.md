---
name: run-all-apps
description: Start, check or stop the complete AssurMatch local stack (API, public site, admin back-office, broker back-office, notification worker, PostgreSQL, Redis, Mailpit) on an alternate port profile (47600-47603 for the apps, 47632/47679/47025/47825 for the infrastructure) that avoids the usual developer ports and never collides with the default stack on 3600-3603. Use it whenever the user asks to run, launch, start, boot, restart, stop or check "all the apps", "the whole stack", "toutes les apps", "lancer le projet", "démarrer les services", wants the apps up to test something in a browser, or complains about a port already in use.
---

# Run all AssurMatch apps (alternate ports)

The project ships a launcher (`launch-local.bat` → `scripts/local-app/launch-local.ps1`) that starts
everything on 3600-3603 with PostgreSQL on 55433, Redis on 56380 and Mailpit on 1025/8025. Those
ports are often already taken (a previous launch, another checkout, a worktree, another tool), and
a launch then fails on "Port already in use". This skill runs the exact same launcher with a port
profile nothing else normally listens on, in its own Docker Compose project and log directory, so
it can even run next to the default stack.

| Service | URL / address |
| --- | --- |
| API | http://127.0.0.1:47600 |
| Public site | http://127.0.0.1:47601 |
| Admin back-office | http://127.0.0.1:47602 |
| Broker back-office | http://127.0.0.1:47603 |
| Mailpit UI (SMTP 47025) | http://127.0.0.1:47825 |
| PostgreSQL / Redis | 127.0.0.1:47632 / 127.0.0.1:47679 |
| Compose project / logs | `assurmatch-alt` / `.local/logs-alt/` |

The profile lives in `scripts/ports.ps1`; every other script dot-sources it, so changing a port there
is enough.

## Commands (run from the repository root, PowerShell)

Start everything (Docker infrastructure, Prisma migrate + seed + local broker demo seed, API, three
Next dev servers, the notification worker), wait until each URL answers, then run
`npm run local:health` against it:

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/run-all-apps/scripts/start.ps1
```

The demo seed matters: the base seed leaves quotes disabled and no product published, so without it
the public site has no offers and the health check fails on the quote form. It runs inside the
launcher, before the servers start (`ASSURMATCH_LOCAL_DEMO_SEED=1`), because the public site caches
the catalogue for ten minutes and would not see data seeded afterwards. It is idempotent and creates
the demo broker accounts (`starter.owner@broker.example`, `pro.*@broker.example`,
`enterprise.owner@broker.example`) that the "Mode local" login picker lists.
Set `LOCAL_DEMO_BROKER_PASSWORD` (12+ characters) before starting to pick their password; otherwise a
random one is used, which is fine because the local picker needs none. Flags: `-SkipDemoSeed`,
`-SkipHealth`. Expect 2 to 4 minutes the first time (image pull, volume creation, Next compilation,
seed); later starts take about a minute.

Show what answers on the profile without changing anything:

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/run-all-apps/scripts/status.ps1
```

Stop only this stack (its processes and its containers; the default stack and its data are untouched):

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/run-all-apps/scripts/stop.ps1
```

From the Bash tool, prefix with `powershell.exe -ExecutionPolicy Bypass -File` the same way; the
scripts contain no interactive prompt. Starting takes longer than the default tool timeout, so give
the start command a generous timeout (five minutes) or run it in the background and poll `status.ps1`.

## One dev stack per checkout

Next 16 writes `apps/<app>/.next/dev/lock` and refuses a second `next dev` in the same app directory,
whatever the port ("You can access the existing server at ..."). So the alternate ports protect
against *other* software and stale processes, not against the default stack started from the same
checkout: `start.ps1` checks the three lock files and stops with an explicit message when a live dev
server of this checkout is found. To really run two stacks side by side, start the second one from a
git worktree (its `.next` directories are its own; it shares `node_modules` with the main checkout).

## What to do with the result

- Report the five URLs above to the user; they are what to open in a browser. The seeded demo
  accounts and data are the same as the default stack (the seed script is the one of the project).
- If the launcher stops on "Port 476xx is already in use", the alternate stack is probably still
  running from an earlier session: run `stop.ps1`, then `start.ps1` again. If a *foreign* process owns
  the port, pick another number in `scripts/ports.ps1` (the launcher only reads those variables).
- If Docker is not running, the launcher fails at "Docker Compose local infrastructure startup":
  start Docker Desktop and retry; nothing else can be started without PostgreSQL.
- Logs of every process are in `.local/logs-alt/<name>.out.log` and `.err.log`
  (`api-47600`, `public-47601`, `admin-47602`, `broker-47603`, `worker-notifications`). Read the
  `.err.log` of the service that does not answer before retrying.
- For browser checks with the project's own smoke test, the environment set by `ports.ps1`
  (`ASSURMATCH_LOCAL_*_URL`) is exactly what `npm run test:web:local` and `npm run local:health` read,
  so run them from a shell where `scripts/ports.ps1` was dot-sourced, or through `start.ps1`.

## Why it works this way

`launch-local.ps1` and `stop-local.ps1` read every port, the Compose project name and the log
directory from `ASSURMATCH_LOCAL_*_PORT`, `ASSURMATCH_POSTGRES_PORT`, `ASSURMATCH_REDIS_PORT`,
`ASSURMATCH_MAILPIT_*_PORT`, `ASSURMATCH_COMPOSE_PROJECT` and `ASSURMATCH_LOCAL_LOG_DIR`, falling back
to the historical defaults. The skill only sets those variables: there is one launcher to maintain,
and `launch-local.bat` / `stop-local.bat` keep behaving as they always did. The separate Compose
project (`assurmatch-alt`) means separate containers and volumes, which is what makes running two
stacks at once safe; it also means the alternate database starts empty and is migrated and seeded on
first start.
