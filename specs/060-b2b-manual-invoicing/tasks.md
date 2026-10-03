# Tâches : Facturation B2B manuelle (spec 060)

**Spec** : `spec.md` — **Plan** : `plan.md` — **Recherche** : `research.md`

## Phase 1 — Contrats, RBAC, données

- [x] T001 Étendre `packages/shared/contracts/billing.contracts.ts` : facture émise, ligne, paiement, avoir, état des comptes, vue courtier, schémas d'entrée (émission, paiement, avoir), `invoiceId` facultatif sur le pack.
- [x] T002 Affiner la matrice RBAC (`billing:invoice_issue`, `billing:payment_record`, `billing:credit_note`, `billing:pack_grant` pour finance_admin ; `billing:read_own` pour owner/manager/read-only) et la table miroir courtier.
- [x] T003 Prisma : modèles `IssuedInvoice`, `InvoicePayment`, `CreditNote`, `InvoiceNumberSequence`, colonne `LeadPack.invoiceId` ; migration `0027_b2b_invoicing` avec triggers d'immuabilité ; liste de `prisma-migrations.spec.ts`.

## Phase 2 — Domaine backend

- [x] T004 `invoicing.config.ts` : TVA par pays (CI 18 %, SN 18 % par défaut), mentions émetteur depuis l'environnement, placeholders `[A COMPLETER]`, délai de paiement, exigence production.
- [x] T005 `invoice-numbering.ts` : formats de numéro, lignes facture depuis le brouillon, HT/TVA/TTC entiers XOF, statut de paiement.
- [x] T006 `invoice-pdf.ts` : écrivain PDF minimal (WinAnsi, échappement, pagination) + rendu facture et avoir.
- [x] T007 `invoicing.repository.ts` : dépôts mémoire et Prisma (allocation + insertion transactionnelles, verrous optimistes, append-only).
- [x] T008 `invoicing.service.ts` : émission, PDF + empreinte, paiement, avoir, état des comptes, vues courtier, RBAC, scopes pays, flag, audit, notification in-app.
- [x] T009 Packs : `invoiceId` facultatif vérifié (facture du partenaire, payée ou partiellement), permission `billing:pack_grant`.
- [x] T010 Brouillons : relevé refusé à `broker_agent` ; recalcul ignoré pour un brouillon déjà facturé.
- [x] T011 Câblage `BillingModule`, `AssurMatchRuntime` (stockage documentaire, notifications in-app) et routes HTTP admin / courtier avec conversion d'erreurs.

## Phase 3 — Back-offices

- [x] T012 Admin `/billing` : onglets « Factures » (émission depuis brouillon, paiement, avoir, PDF) et « Comptes » (état des comptes, pack lié à une facture) ; actions serveur ; routes proxy PDF.
- [x] T013 Courtier `/billing` (tous plans) : relevé, solde, factures/avoirs avec PDF via proxy, packs ; entrée de menu ; lien depuis `/crm`.

## Phase 4 — Tests et validation

- [x] T014 Tests unitaires : numérotation, TVA, totaux, statut, avoir, PDF, configuration.
- [x] T015 Tests d'intégration HTTP : RBAC, immuabilité, paiements, avoirs, isolation courtier, flag, production sans mentions, pack lié.
- [x] T016 Tests de sources admin / courtier (Playwright) et mise à jour des tests billing existants.
- [x] T017 Validations : typecheck, lint, vitest complet, Playwright admin/broker, `next build` admin et broker, scan de secrets.

## Notes d'implémentation

- **17/17 tâches terminées.**
- Migration `0027_b2b_invoicing` (numéro provisoire, à réaligner par le superviseur à la fusion ; mettre à jour `prisma-migrations.spec.ts` en conséquence).
- Routes admin sous `/admin/billing/issued-invoices…` pour ne pas modifier les routes de brouillons de la spec 037 (`/admin/billing/invoices`).
- Le relevé courtier `GET /broker/billing/statement` est désormais refusé aux `broker_agent` (FR-16), y compris dans `/crm`.
- Les restrictions de la fondation billing passent de `no_invoice_issuance` à `manual_invoicing_only` + `no_online_payment`.
- Un avoir ne peut annuler qu'une facture sans paiement ; l'annulation d'un paiement saisi par erreur reste hors périmètre.
- Variables d'environnement documentées dans `.env.preproduction.example` (valeurs légales vides : aucune donnée inventée).
- Playwright : la configuration racine ignore `**/.claude/**` ; depuis un worktree situé sous `.claude/worktrees`, lancer les specs avec une configuration temporaire sans cet ignore.
