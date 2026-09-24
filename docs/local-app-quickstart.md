# Local App Quickstart

## How to see the app locally

From `D:\APP\AssurMatch`, start the full local stack:

```powershell
cmd /c launch-local.bat
```

Open these URLs:

- API: `http://localhost:3600`
- Web Publique Client: `http://localhost:3601`
- Back-office Plateforme/Admin: `http://localhost:3602`
- Mailpit: `http://localhost:8025`

The broker back-office remains a separate authenticated app for constitutional
separation and is launched at `http://localhost:3603`.

The launcher maps local/dev PostgreSQL to `127.0.0.1:55433` and Redis to
`127.0.0.1:56380` to avoid collisions with default services already installed
on Windows machines.

Useful checks:

```powershell
npm run local:health
npm run test:web:local
```

## Queued Email Delivery

The API never sends email itself: a quote submission writes notification rows at
`queued` and a worker drains them. The launcher therefore starts a fifth
process, `worker-notifications`, alongside the API and the three web apps. It
runs `scripts/quote-notification-delivery-worker.ts` every 10 seconds with the
launcher environment, so the visitor confirmation and the broker "nouveau lead"
email reach Mailpit within seconds of a demo submission. No manual command is
needed locally.

- Log: `.local\logs\worker-notifications.out.log`, one counter line per run
  (`due/processed/sent/retryable/failed/notConfigured`). Recipients and lead
  content are never logged.
- Interval: `ASSURMATCH_LOCAL_WORKER_INTERVAL_SECONDS` (default 10).
- Partner webhook deliveries are not polled by default because the webhook
  worker audits a refusal on every run while `partner_webhooks_enabled` is off.
  Set `ASSURMATCH_LOCAL_WORKER_PARTNER_WEBHOOKS=true` to include them.
- `npm run local:health` reports the loop advisorily: it warns when the log is
  missing or stale and never fails the run for it.
- `cmd /c stop-local.bat` stops the loop with the rest of the stack.
- The loop refuses to start when `APP_ENV` is `production` or `preproduction`.
  On those environments the operator still schedules
  `npm run quote-notifications:deliver-due` — see
  [the runbook](runbooks/quote-notification-delivery.md).

To run it by hand outside the launcher:

```powershell
node scripts/local-app/notification-worker-loop.mjs
```

It needs the same environment as the launcher (`APP_ENV=local`,
`DATABASE_URL`, `REDIS_URL`, `EMAIL_SERVICE_TYPE=mailpit`, `EMAIL_FROM`,
`EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `ASSURMATCH_AUTH_TOKEN_SECRET`); Ctrl+C
stops it.

Stop local processes and Docker services without deleting local volumes:

```powershell
cmd /c stop-local.bat
```

## Bootstrap Admin

The launcher never commits or prints a bootstrap password. To create a local
admin, set credentials in your shell before launching:

```powershell
$env:LOCAL_BOOTSTRAP_ADMIN_EMAIL = "admin@assurmatch.local"
$env:LOCAL_BOOTSTRAP_ADMIN_PASSWORD = "<local password with 12+ chars>"
cmd /c launch-local.bat
```

The runtime refuses local bootstrap when `APP_ENV=production`.

## Broker Demo Data

The broker back-office can be populated with synthetic local-only broker data
for UX review. Start the local stack first, then run:

```powershell
$env:APP_ENV = "local"
$env:DATABASE_URL = "postgresql://assurmatch:assurmatch@127.0.0.1:55433/assurmatch"
$env:LOCAL_DEMO_BROKER_PASSWORD = "<local password with 12+ chars>"
npm run local:seed:broker-demo
```

Demo broker users:

- `starter.owner@broker.example`
- `pro.owner@broker.example`
- `pro.manager@broker.example`
- `pro.agent@broker.example`
- `pro.readonly@broker.example`
- `enterprise.owner@broker.example`

To verify the CRM unavailable state for Pro/Enterprise brokers:

```powershell
npm run local:seed:broker-demo:crm-off
```

The seed refuses production/preproduction, uses fake data only, keeps regulated
modules disabled and does not change the Prisma schema.

## Bilingual Public Site (spec 045)

The public visitor app moved every page under `app/[locale]/` and became
bilingual: French is the default locale and is served unprefixed, English is
served under `/en`. The route words themselves are localised (not just the
prefix), for example:

| Page | French (default, unprefixed) | English |
| --- | --- | --- |
| Countries directory | `/pays` | `/en/countries` |
| Country page | `/pays/CI` | `/en/countries/CI` |
| Product page | `/pays/CI/produits/auto` | `/en/countries/CI/products/auto` |
| Offers list | `/pays/CI/produits/auto/offres` | `/en/countries/CI/products/auto/offers` |
| Quote request | `/pays/CI/produits/auto/devis` | `/en/countries/CI/products/auto/quote` |
| Compare | `/comparer` | `/en/compare` |
| Offer detail | `/offres/:offerId` | `/en/offers/:offerId` |
| Quote tracking | `/demandes-de-devis/:publicReference` | `/en/quote-requests/:publicReference` |
| How it works | `/comment-ca-marche` | `/en/how-it-works` |
| Regulatory status | `/statut-reglementaire` | `/en/regulatory-status` |
| Legal notice / privacy / terms | `/mentions-legales`, `/confidentialite`, `/cgu` | `/en/legal-notice`, `/en/privacy`, `/en/terms` |
| Cookies | `/cookies` (same word both locales) | `/en/cookies` |
| Brokers | `/courtiers`, `/courtiers/tarifs`, `/courtiers/candidature`, `/courtiers/connexion` | `/en/brokers`, `/en/brokers/pricing`, `/en/brokers/apply`, `/en/brokers/login` |
| Contact, guides, FAQ | `/contact`, `/guides`, `/faq` (same words both locales) | `/en/contact`, `/en/guides`, `/en/faq` |
| Glossary | `/lexique` | `/en/glossary` |

The full map is `apps/public/i18n/routing.ts`; every legacy (pre-045) URL
redirects permanently to its French equivalent via `apps/public/next.config.ts`.

New pages added in this release: the countries directory and its per-country
waiting-list variant, the country's brokers and insurers directories and broker
detail page, "how it works", "regulatory status", the four legal pages and
their per-country overrides, guides index/detail, FAQ, glossary, contact, and
the broker acquisition pages (landing, pricing, application, login).

New public endpoints consumed by the site (`apps/public/app/lib/public-api.ts`):
`GET /countries/directory`, `GET /public-stats`, `GET /countries/:code/partners`,
`GET /countries/:code/partners/:id`, `GET /countries/:code/insurers`,
`GET /partners/plans`, `POST /waitlist`, `POST /contact`,
`POST /partners/applications`, and
`POST /quote-requests/:publicReference/consent-withdrawal` (consent
withdrawal).

The demo seed (`scripts/local-app/seed-broker-demo.ts`) now depends on
migration `0017_public_site_forms` (consent withdrawal, contact messages,
waitlist subscriptions and partner applications): run migrations before
seeding, which `launch-local.bat` already does, but a manual
`npm run local:seed:broker-demo` against an older database must apply
`backend/prisma/migrations/0017_public_site_forms` first.

## Data Safety

The launcher runs Prisma migrations and the existing seed. Seeded records are
synthetic/internal and regulated feature flags remain disabled by default.
