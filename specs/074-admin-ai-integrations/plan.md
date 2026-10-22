# Plan d'implémentation : spec 074

**Surfaces** : Backend API, shared packages, Back-office Plateforme/Admin. Pas de migration. Pas de changement Broker/Public.

## Architecture
### Backend
- `packages/shared/contracts/ai-scope-flags.contracts.ts` (nouveau) : `aiScopeFlagKeys`, `aiScopeFlagChangeSchema`, `AiScopeFlagsOverview`.
- `backend/src/modules/ai/ai-scope-flags.service.ts` (nouveau) : `AiScopeFlagPolicyService` { overview(actor), apply(actor, input) } sur `CountriesService`, `ProductsService`, `FeatureFlagsService.applyCompliancePolicy`, `AuditLogWriter`, hook `onChanged`.
- `backend/src/modules/feature-flags/sensitive-feature-flag-policy.ts` : trois clés ajoutées à l'ensemble protégé (bloc `// Lot 7`).
- `backend/src/modules/partner-integrations/partner-integrations.service.ts` : `sendTestWebhook(actor, endpointId, input)`; contrat `partnerWebhookTestSchema` / `PartnerWebhookTestResponse` dans `partner-integration.contracts.ts`; actions d'audit `webhookTestSent`/`webhookTestRefused`.
- Câblage (chef de lot, blocs `// Lot 7`) : `assurmatch-runtime.ts` (instanciation du service), `runtime-http-wiring.module.ts` (routes `ai/scope-flags`, `.../webhook-endpoints/:id/test`).

### Admin app
- `apps/admin/app/ai-assistance/flags/page.tsx` + `scope-flag-form.tsx` (client) + `lib/ai-scope-flag-actions.ts` (server actions) ; lecture dans `lib/ai-scope-flags-api.ts`.
- `apps/admin/app/partner-integrations/page.tsx` + composants client (`integration-forms.tsx`) + `lib/partner-integration-actions.ts`.
- `apps/admin/app/messaging/page.tsx` + `messaging-test-form.tsx` + `lib/messaging-test-actions.ts`.
- Navigation : entrée « Flags IA » dans `lib/ui/admin-shell.tsx`.

## Contrats HTTP
- `GET /admin/ai/scope-flags` -> `{ generatedAt, globalFlags:[{key,value}], countries:[{id,code,name,flags:{country_ai_enabled}}], products:[{id,key,name,sensitivity,flags:{product_ai_scoring_enabled,product_ai_form_assistant_enabled}}], history:[{key,scopeType,scopeId,value,reason,changedAt}] }`
- `POST /admin/ai/scope-flags` `{scopeType,scopeId,key,value,reference?,approvedBy?,reason}` -> `{scopeType,scopeId,key,previousValue,value,appliedAt}` ; 200. Refus : 403 (rôle, MFA, portée), 422 (produit sensible, référence/approbateur manquants à l'activation).
- `POST /admin/partner-integrations/webhook-endpoints/:id/test` `{reason}` -> `{endpointId,eventId,eventType:"webhook.test",outcome:"delivered"|"failed"|"refused",responseClass,durationMs,sentAt}`.

## Parallélisation (un propriétaire par fichier)
T1 backend flags IA | T2 backend test webhook | T3 UI intégrations | T4 UI flags IA + messagerie. Câblage et validation globale : chef de lot.

## Risques
Conflit avec le lot 5 (billing, `POLICY_ACTIVATABLE_FLAGS`, `ai_assisted_routing_enabled`) : aucun de ces fichiers n'est modifié. Les blocs partagés sont `// Lot 7`.
