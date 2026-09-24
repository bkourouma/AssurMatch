# Implementation Plan: Public Site — Bilingual Shell, Brand System and Institutional Surface

**Spec**: `specs/045-public-site-bilingual-institutional/spec.md`
**Impacted surfaces**: Web Publique Client (major), Backend API (public endpoints, two admin reads),
shared packages (contracts), database (migration 0017), runtime (env, health script, seed), docs.
**Blocked on**: nothing. The brand assets are in the repository under `apps/public/public/`.

## Sequencing rationale

Two foundations land first and in parallel, because everything else is written against them and
neither depends on the other: the shared contracts plus the database shape on the backend side, and
the internationalisation scaffold plus the design tokens and UI primitives on the front end. Writing a
page before the primitives exist would mean rewriting it; writing a service before the contract
exists would mean two definitions of the same payload.

The front end deliberately does not wait for the backend. Every new API wrapper degrades to an error
state that renders an empty state, and the country directory falls back to the existing public
country list when its endpoint is absent. A page can therefore be built, type-checked and reviewed
before the endpoint it will eventually call exists.

The wiring of the HTTP layer is last and belongs to one owner. `runtime-http-wiring.module.ts` and
`assurmatch-runtime.ts` are the two files every backend module must eventually touch; letting five
agents edit them concurrently would produce conflicts in exactly the code that decides what is
publicly reachable. The feature modules are written blind to the wiring and the wiring is added once,
with the integration tests that prove the routes answer.

Tests come last but are authored from a fixed contract agreed up front: the list of structural
markers that must survive in page sources and the mapping from each accent-stripped French string to
its accented replacement. Without that contract, moving copy into message catalogues would silently
invalidate eleven existing specs.

1. **Shared foundation.** Zod contracts for every new payload, the three Prisma models, migration
   0017, the shared public abuse guard (honeypot, per-IP and per-session limits), the audit action
   names, and the retention helper calls. Error messages are chosen to match the existing response
   filter's regexes, so a blocked submission is a 400 and not a 500.
2. **Front-end foundation.** next-intl routing with the full path map, the proxy, the redirects from
   every pre-migration URL, the message catalogues, the design tokens with an alias layer that keeps
   already-written pages rendering, the fonts, the logo components, the twenty UI primitives, the
   header and footer, the SEO helpers, and the move of every existing page under the locale segment.
3. **Feature modules, in parallel.** Waiting list, broker applications, contact messages, the public
   broker directory and stats, the insurer list and the public plan prices, and consent withdrawal.
   Each owns its own directory, its own repository pair (memory and Prisma) and its own unit tests.
4. **Pages, in parallel.** The visitor journey restyle and the new entry pages; the institutional,
   legal and content pages with the contact form; the broker acquisition pages with the application
   form; the directories and the sitemap; the English catalogue.
5. **Wiring.** Controllers, runtime accessors, guardrail updates, integration tests over the HTTP
   harness, and the demo seed additions that make the new surfaces visible locally.
6. **Tests, scripts and docs.** The updated source-marker specs, the new specs, the vocabulary
   guardrail, the content-safety change, the launcher and health script, the quickstart and the
   coverage map.
7. **Assembly.** Full validation suite, a real Next build, the local stack end to end, a read-only
   design review of the main screens, and a pass over the copy against the banned list.

## Risks

- **Copy moving into catalogues breaks the existing specs silently.** Eleven specs assert
  accent-stripped French substrings against page sources. Mitigated by the marker contract: the
  structural markers stay in the source, the copy markers move to the catalogue, and each spec is
  updated to read whichever of the two now holds its assertion.
- **A green suite over a dead site.** The existing web specs mostly read files rather than render
  pages, so they can pass while the site is broken. Mitigated by making a real `next build` and the
  browser smoke run part of validation rather than optional, and by extending the smoke to the new
  pages, the 404 and the English locale.
- **Two definitions of the same payload.** The front end declares the new request and response types
  locally so it does not block on the contracts file. They must converge; the wiring step is where
  the integration tests catch a mismatch, and the front-end types are replaced by the shared ones
  only after the endpoints answer.
- **The directory exposing more than it should.** A partner record carries e-mail, WhatsApp, plan,
  quota and capacity. The public projection is an explicit field list, never a spread of the model,
  and the integration test asserts the absent fields by name.
- **Automatic locale detection breaking local tooling.** The health script and the launcher accept
  only a 200 on the root, and the browser smoke sends an English Accept-Language header. Detection is
  off; if it is ever turned on, both must be adjusted in the same change.
- **Font download at build time.** `next/font/google` fetches during the build. If the build host has
  no network, the fallback is a local font file or the system stack, decided in the foundation step
  and recorded there rather than discovered during a release.
