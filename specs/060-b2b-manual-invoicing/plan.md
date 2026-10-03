# Plan d'implémentation : Facturation B2B manuelle (spec 060)

**Spec** : `specs/060-b2b-manual-invoicing/spec.md` — **Recherche** : `research.md`
**Dépendances** : spec 037 (tarifs, brouillons, packs), spec 038 (notifications in-app), spec 010 (stockage documentaire).

## Surfaces impactées

- **Backend API** : `backend/src/modules/billing/*`, `backend/src/modules/http-wiring/runtime-http-wiring.module.ts`, `backend/src/runtime/assurmatch-runtime.ts`.
- **Shared packages** : `packages/shared/contracts/billing.contracts.ts`, `packages/shared/rbac/assurmatch-role-matrix.ts`.
- **Base de données** : `backend/prisma/schema.prisma`, migration `backend/prisma/migrations/0027_b2b_invoicing/migration.sql` (numéro à réaligner par le superviseur à la fusion).
- **Back-office Plateforme** : `apps/admin/app/billing/page.tsx`, `apps/admin/app/billing/invoices/[id]/pdf/route.ts`, `apps/admin/app/billing/credit-notes/[id]/pdf/route.ts`, `apps/admin/app/lib/admin-api.ts`, `apps/admin/app/lib/billing-actions.ts`.
- **Broker Back-office** : `apps/broker/app/billing/page.tsx`, route handlers PDF, `apps/broker/app/lib/broker-api.ts`, `apps/broker/app/lib/broker-permissions.ts`, `apps/broker/app/lib/ui/broker-shell.tsx`.
- **Web Publique Client** : aucun changement.

## Architecture

```
DraftInvoice (037) ──issue──▶ IssuedInvoice ──payments──▶ InvoicePayment*
                                   │                         (append-only)
                                   └──credit note──▶ CreditNote (annule, append-only)
InvoiceNumberSequence(country, year, kind) ── allocation transactionnelle
DocumentStoragePort ── PDF (clé opaque, SHA-256)
MessagingDispatchService.publishInApp ── invoice_issued / credit_note_issued
LeadPack.invoiceId ── pack attribué après paiement constaté
```

### Modules backend

| Fichier | Rôle |
|---|---|
| `invoicing.config.ts` | Résolution env : TVA par pays (bps), mentions émetteur, délai de paiement, exigence de mentions complètes. |
| `invoice-numbering.ts` | Format des numéros, calcul pur des lignes, HT, TVA, TTC, statut de paiement. |
| `invoice-pdf.ts` | Écrivain PDF minimal + rendu facture / avoir. |
| `invoicing.repository.ts` | `MemoryInvoicingRepository` et `PrismaInvoicingRepository` (transactions, verrous optimistes). |
| `invoicing.service.ts` | Cas d'usage admin et courtier, RBAC, scopes pays, feature flag, audit, notification, intégrité PDF. |
| `invoicing-errors.ts` | `InvoiceNotFoundError` (404), `InvoiceConflictError` (409), `InvoicingConfigurationError` (422). |

### API HTTP

Admin (`/admin/billing`, MFA) :
- `GET issued-invoices?partnerId&status` · `POST issued-invoices` `{draftId, reason}`
- `GET issued-invoices/:id` · `GET issued-invoices/:id/pdf`
- `POST issued-invoices/:id/payments` `{amount, receivedAt, method, reference, note?}`
- `POST issued-invoices/:id/credit-note` `{reason}` · `GET credit-notes/:id/pdf`
- `GET accounts/:partnerId` (état des comptes)
- `POST packs` accepte `invoiceId` facultatif.

Courtier (`/broker/billing`, MFA, `billing:read_own`) :
- `GET statement` (existant, désormais refusé aux agents) · `GET account` · `GET invoices/:id/pdf` · `GET credit-notes/:id/pdf`.

Les erreurs de domaine sont converties explicitement (403/404/409/422) par un wrapper `invoicingCall`.

## Impacts transverses

- **Sécurité** : MFA, RBAC fin, isolation tenant (404 sur tenant étranger), scopes pays admin, PDF via proxy serveur, pas de clé de stockage exposée aux courtiers.
- **Conformité** : pas d'encaissement de prime, pas de paiement en ligne (`paymentsEnabled: false` conservé), mentions explicites sur la facture, données légales non inventées.
- **Données** : 4 tables + 1 colonne, triggers d'immuabilité, aucune donnée de prospect sur la facture (uniquement des compteurs).
- **Feature flags** : `billing_enabled` pour toutes les mutations. Aucun nouveau flag.
- **IA / Routage** : aucun impact.
- **Audit** : nouvelles actions `billing.invoice.*`, `billing.credit_note.*`, `billing.payment.recorded`, `billing.account.read`.

## Stratégie de tests

- Unitaires : numérotation, calcul TVA / totaux / arrondis XOF, statut de paiement, PDF (en-tête, échappement, contenu, déterminisme), configuration (défauts, surcharges, mentions incomplètes).
- Intégration HTTP : émission + notification + PDF, réémission refusée, immuabilité dépôt, paiements partiels / soldés / surpaiement, avoir + réémission, pack lié, RBAC (support, agent, autre tenant, scope pays), flag fermé, production sans mentions.
- Sources admin / courtier (Playwright, sans navigateur) : marqueurs de pages, routes proxy, absence de vocabulaire de paiement en ligne.
- Migration : liste `prisma-migrations.spec.ts` + contenu SQL (tables, triggers).

## Validation

`npm run typecheck`, `npm run lint`, `npx vitest run`, `npx playwright test apps/admin apps/broker`, `npx next build` (admin, broker), scan de secrets sur le diff.
