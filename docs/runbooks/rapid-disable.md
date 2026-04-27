# Runbook — Rapid disable (kill switch)

## When

Incident on a country / product / partner / global flag requires immediate public removal.

## Steps

1. Identify the flag scope. For a country: `country_public_enabled` for that country's scopeId.
2. Flip the flag to `false`:
   ```bash
   curl -X PATCH https://api-assurmatch.allianceconsultants.net/admin/feature-flags/<flag-id> \
     -H "Authorization: Bearer <admin token>" \
     -d '{"value": false, "reason": "incident <id>: rapid disable"}'
   ```
3. Verify the surface no longer exposes the scope (curl public catalog).
4. Communicate to affected partners (email or other channel).
5. Open a post-incident review.

## Test schedule

Exercise this runbook at least once per quarter on a non-critical scope to keep operators trained.
