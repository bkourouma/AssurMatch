# Runbook — Smoke tests (preprod)

Manual smoke checklist against the deployed environment.

```bash
# Health
curl -H "Authorization: Bearer <admin-token>" https://api-assurmatch.allianceconsultants.net/admin/system/health

# Public catalog (only countries with country_public_enabled=true appear)
curl https://api-assurmatch.allianceconsultants.net/countries

# Quote consented (full payload per spec 002 contract)
curl -X POST https://api-assurmatch.allianceconsultants.net/quote-requests -d @sample-consented.json -H "content-type: application/json"

# Quote without consent must be refused
curl -X POST https://api-assurmatch.allianceconsultants.net/quote-requests -d @sample-no-consent.json -H "content-type: application/json"

# Broker portal — deny without broker_dashboard_enabled, allow once on
curl -H "Authorization: Bearer <starter-token>" https://api-assurmatch.allianceconsultants.net/broker/dashboard

# Admin dashboard — deny broker, allow super_admin
curl -H "Authorization: Bearer <admin-token>" https://api-assurmatch.allianceconsultants.net/admin/dashboard

# Cross-tenant attempt — must be refused
curl -H "Authorization: Bearer <broker-A-token>" "https://api-assurmatch.allianceconsultants.net/broker/dashboard?partnerId=<other-tenant>"
```

Document the results in the operations journal.
