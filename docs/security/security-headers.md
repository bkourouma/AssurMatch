# En-têtes de sécurité HTTP

Spec 058 FR-007. Source unique : `packages/shared/security/security-headers.ts`, servie par les trois
apps Next (`apps/*/next.config.ts`, règle `/:path*`) et reprise par nginx
(`deploy/nginx/security-headers.conf`, inclus par les quatre vhosts TLS).

| En-tête | Valeur | Remarque |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' <API>; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests` | `connect-src` reçoit l'origine des `NEXT_PUBLIC_*_API_URL` de l'app. En `next dev` : `'unsafe-eval'` et `ws:`/`wss:` en plus, sans `upgrade-insecure-requests`. API (JSON) : CSP de repli nginx `default-src 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Uniquement `NODE_ENV=production` (et toujours par nginx en HTTPS) |
| `X-Frame-Options` | `DENY` | + `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Pages visiteur à jeton (`/suivi`, `/demandes-de-devis/*`, `/avis/*` et équivalents) : `no-referrer` + `X-Robots-Tag: noindex, nofollow` (spec 054), déclarés **après** la règle générale (Next garde la dernière valeur) ; nginx conserve la valeur de l'app |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` | |
| `Cross-Origin-Opener-Policy` | `same-origin` | Apps uniquement |

## Pourquoi `'unsafe-inline'` dans `script-src`

L'App Router insère ses scripts d'amorçage en ligne. Un nonce impose le rendu dynamique de toutes les
pages (guide Next « Content Security Policy ») ; le hachage SRI est expérimental. Aucun script tiers
n'est chargé et le reste de la politique est fermé ; à réévaluer si un nonce devient acceptable.

## Vérifications

- Tests : `backend/tests/unit/security/security-headers.spec.ts` (vitest),
  `apps/{admin,broker}/tests/security-headers.spec.ts`, `apps/public/tests/public-security-headers.spec.ts`
  (Playwright ; contrôle en direct avec `ASSURMATCH_E2E_{PUBLIC,ADMIN,BROKER}_URL`).
- Manuel : `curl -sI https://<domain>/suivi | grep -i -E 'referrer|robots|content-security|strict'`.
- Après modification de nginx : `sudo nginx -t && sudo systemctl reload nginx`.
