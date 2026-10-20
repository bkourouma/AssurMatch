-- Spec 066 F1: detect quote requests created before the shared-phone fix that still point at
-- another visitor's Prospect. Read-only: it runs in a READ ONLY transaction and prints no contact
-- data (only public references, dates, country codes and truncated fingerprints).
--
-- A request is affected when the e-mail it was submitted with (the consent subject, an e-mail
-- fingerprint written at submission time) differs from the e-mail of the Prospect it is linked to.
-- Such a request sends its visitor e-mails, tracking links and broker contact view to that other
-- person, and an erasure of that person would anonymize it too.
--
-- Usage (preproduction, then production before opening):
--   psql "$DATABASE_URL" -f scripts/ops/sql/f1-shared-prospect-detection.sql

BEGIN TRANSACTION READ ONLY;

-- 1. Summary.
SELECT
  count(*)                       AS affected_requests,
  count(DISTINCT qr."prospectId") AS shared_prospects
FROM "QuoteRequest" qr
JOIN "ConsentRecord" cr ON cr.id = qr."consentRecordId"
JOIN "Prospect" p       ON p.id = qr."prospectId"
WHERE qr."anonymizedAt" IS NULL
  AND p."emailFingerprint" IS NOT NULL
  AND cr."subjectReference" <> p."emailFingerprint";

-- 2. Detail, without contact data.
SELECT
  qr."publicReference",
  qr."createdAt",
  c."isoCode"                              AS country,
  qr.status,
  left(qr."prospectId", 8)                 AS prospect_prefix,
  left(cr."subjectReference", 8)           AS submitted_email_fp,
  left(p."emailFingerprint", 8)            AS linked_email_fp
FROM "QuoteRequest" qr
JOIN "ConsentRecord" cr ON cr.id = qr."consentRecordId"
JOIN "Prospect" p       ON p.id = qr."prospectId"
JOIN "Country" c        ON c.id = qr."countryId"
WHERE qr."anonymizedAt" IS NULL
  AND p."emailFingerprint" IS NOT NULL
  AND cr."subjectReference" <> p."emailFingerprint"
ORDER BY qr."createdAt";

ROLLBACK;
