# Tâches : Facturation B2B manuelle (spec 060)

**Spec** : `spec.md` — **Plan** : `plan.md` — **Recherche** : `research.md`

## Phase 1 — Contrats, RBAC, données

- [ ] T001 Étendre `packages/shared/contracts/billing.contracts.ts` : facture émise, ligne, paiement, avoir, état des comptes, vue courtier, schémas d'entrée (émission, paiement, avoir), `invoiceId` facultatif sur le pack.
- [ ] T002 Affiner la matrice RBAC (`billing:invoice_issue`, `billing:payment_record`, `billing:credit_note`, `billing:pack_grant` pour finance_admin ; `billing:read_own` pour owner/manager/read-only) et la table miroir courtier.
- [ ] T003 Prisma : modèles `IssuedInvoice`, `InvoicePayment`, `CreditNote`, `InvoiceNumberSequence`, colonne `LeadPack.invoiceId` ; migration `0027_b2b_invoicing` avec triggers d'immuabilité ; liste de `prisma-migrations.spec.ts`.

## Phase 2 — Domaine backend

- [ ] T004 `invoicing.config.ts` : TVA par pays (CI 18 %, SN 18 % par défaut), mentions émetteur depuis l'environnement, placeholders `[A COMPLETER]`, délai de paiement, exigence production.
- [ ] T005 `invoice-numbering.ts` : formats de numéro, lignes facture depuis le brouillon, HT/TVA/TTC entiers XOF, statut de paiement.
- [ ] T006 `invoice-pdf.ts` : écrivain PDF minimal (WinAnsi, échappement, pagination) + rendu facture et avoir.
- [ ] T007 `invoicing.repository.ts` : dépôts mémoire et Prisma (allocation + insertion transactionnelles, verrous optimistes, append-only).
- [ ] T008 `invoicing.service.ts` : émission, PDF + empreinte, paiement, avoir, état des comptes, vues courtier, RBAC, scopes pays, flag, audit, notification in-app.
- [ ] T009 Packs : `invoiceId` facultatif vérifié (facture du partenaire, payée ou partiellement), permission `billing:pack_grant`.
- [ ] T010 Brouillons : relevé refusé à `broker_agent` ; recalcul ignoré pour un brouillon déjà facturé.
- [ ] T011 Câblage `BillingModule`, `AssurMatchRuntime` (stockage documentaire, notifications in-app) et routes HTTP admin / courtier avec conversion d'erreurs.

## Phase 3 — Back-offices

- [ ] T012 Admin `/billing` : onglets « Factures » (émission depuis brouillon, paiement, avoir, PDF) et « Comptes » (état des comptes, pack lié à une facture) ; actions serveur ; routes proxy PDF.
- [ ] T013 Courtier `/billing` (tous plans) : relevé, solde, factures/avoirs avec PDF via proxy, packs ; entrée de menu ; lien depuis `/crm`.

## Phase 4 — Tests et validation

- [ ] T014 Tests unitaires : numérotation, TVA, totaux, statut, avoir, PDF, configuration.
- [ ] T015 Tests d'intégration HTTP : RBAC, immuabilité, paiements, avoirs, isolation courtier, flag, production sans mentions, pack lié.
- [ ] T016 Tests de sources admin / courtier (Playwright) et mise à jour des tests billing existants.
- [ ] T017 Validations : typecheck, lint, vitest complet, Playwright admin/broker, `next build` admin et broker, scan de secrets.
