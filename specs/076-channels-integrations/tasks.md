# Tasks: Channels and Integrations

- [x] T001 Prisma models ChannelOutbox, CrmConnector, CrmConnectorDelivery + migration 0040 + migration test
- [x] T002 Flag `crm_connector_enabled` (default, sensitive policy, policy-activatable list)
- [x] T003 HTTP SMS provider (json, twilio) with classification of failures
- [x] T004 WhatsApp Cloud provider (template message)
- [x] T005 Environment resolver (complete configuration only; an unrecognised provider keeps the logging provider)
- [x] T006 Dispatcher retry outbox: encrypted payload, lease, consent/flag/provider re-check, dead letter, audit
- [x] T007 CRM connector contracts, repository, service (create/list/update/deliveries/publish/processDue)
- [x] T008 Runtime wiring, event bus hook, worker tasks, admin routes
- [x] T009 .env examples (no secret), spec documents
- [x] T010 Unit tests: providers, outbox/retry, CRM connector
- [x] T011 Runtime HTTP tests with simulated providers (flags closed, consent absent, retry, cancel, CRM signed and minimised)
- [x] T012 Typecheck, lint, targeted and full test suites
- [ ] T013 (follow-up) Platform back-office screen, dead-letter admin alert
