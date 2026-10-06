-- Spec 059 follow-up: indexes only (no table, column or data change).
-- Compliance consent-proof search (POST /admin/consent-records/search): by subject fingerprint and by country.
CREATE INDEX IF NOT EXISTS "ConsentRecord_subjectReference_idx" ON "ConsentRecord"("subjectReference");
CREATE INDEX IF NOT EXISTS "ConsentRecord_countryId_createdAt_idx" ON "ConsentRecord"("countryId", "createdAt");

-- PRD M-03 (quote submission throughput): the prospect match is an OR on the e-mail or the phone
-- fingerprint; the existing index only covered the e-mail branch.
CREATE INDEX IF NOT EXISTS "Prospect_countryId_productId_phoneFingerprint_idx" ON "Prospect"("countryId", "productId", "phoneFingerprint");

-- PRD M-03: the public offer popularity sort counts the requests per selected offer in SQL.
CREATE INDEX IF NOT EXISTS "QuoteRequest_selectedOfferId_idx" ON "QuoteRequest"("selectedOfferId");
