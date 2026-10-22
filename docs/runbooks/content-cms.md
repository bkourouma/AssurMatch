# Runbook — Content CMS (spec 072): publication delay, urgent withdrawal, 409 conflicts

## When

- A content admin asks why a published, rejected or archived FAQ / guide / glossary term / legal
  override is not yet visible (or still visible) on the public site.
- A published text must disappear from the public site urgently.
- An admin reports a `409` ("This content changed since it was read") on a content action.

## Publication and withdrawal delay

The public site reads `GET /public-content` and merges it over its static copy. A change made in the
back-office (approval, archive) reaches visitors in **about 2 minutes at worst**:

| Layer | Delay |
| --- | --- |
| `GET /public-content` answers `Cache-Control: public, max-age=60` (200 only; a 400 is `no-store`) | up to 60 s in a shared cache / reverse proxy, if one caches it |
| Public site data cache (`next: { revalidate: 60 }`) | up to 60 s, and the first request after expiry still serves the previous version while it revalidates |

Within one page render the site reads `/public-content` once per (locale, country) (`React.cache`),
so the 2 s timeout of that read is paid at most once per page.

## Urgent withdrawal

1. Archive the published version in the back-office (Contenu, entry, Archiver, mandatory reason).
   Check the audit log for `content_cms.archived` on that entry.
2. If 2 minutes is too long: purge the reverse-proxy cache for `/public-content*` (if the proxy caches
   it), then restart or redeploy the public site container to drop its data cache.
3. Verify: `curl -s "https://<api>/public-content?locale=fr&country=<XX>"` no longer contains the entry.

## 409 on a content action

Every transition is a conditional write (expected status, `updatedAt` as read, and for an approval a
known submitter different from the approver). A `409` with `concurrent_change` in the audit log
(`content_cms.refused`, reason `concurrent_change`) means another write landed between the read and
this action: reload the entry and redo the action if still relevant. Nothing was written by the
refused action. A publication either archives the previous version and publishes the new one, or
does neither.
