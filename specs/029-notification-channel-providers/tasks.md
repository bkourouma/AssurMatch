# Tasks: SMS/WhatsApp Provider Abstraction Disabled By Default

**Impacted surfaces**: Backend API, notifications module, shared packages, runtime/env.

- [x] T001 Add shared messaging provider contracts.
- [x] T002 Add `sms_enabled` default false and protect SMS/WhatsApp flags.
- [x] T003 Add provider status service and audit actions.
- [x] T004 Wire protected `GET /admin/messaging/providers`.
- [x] T005 Add runtime HTTP tests for disabled defaults, no secrets and refusal.
- [ ] T006 Run full release validation after the current supervisor backlog settles.
