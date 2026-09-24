# Feature Specification: SMS/WhatsApp Provider Abstraction Disabled By Default

**Feature Branch**: `029-notification-channel-providers`
**Created**: 2026-05-03
**Status**: Implemented

## Scope

- **Impacted surfaces**: Backend API, notifications module, shared packages, runtime env inspection. No public UI, broker UI, payment, routing or provider delivery.
- **Role**: Expose a provider status abstraction for SMS and WhatsApp channels.
- **Forbidden behavior**: No send operation, no marketing message, no regulated claim, no provider secret in response, no channel activation by default.
- **Flags**: `sms_enabled=false` and `whatsapp_enabled=false` by default and protected by sensitive feature flag policy.
- **Audit**: Reads emit `messaging_provider.status.read`; refusals emit `messaging_provider.status.refused`.

## Requirements

- Add shared DTOs for provider status.
- Add `GET /admin/messaging/providers`.
- Always return `enabled=false` and `sendCapable=false` in this slice.
- Report provider names and whether secrets are configured without returning secret values.
- Refuse broker/public access.

## Validation

- Runtime HTTP tests cover disabled defaults, no secrets, success audit and broker refusal.
