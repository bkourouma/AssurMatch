# Spécification fonctionnelle : Facturation B2B manuelle des courtiers

**Branche** : `060-b2b-manual-invoicing`
**Créée le** : 2026-10-03
**Statut** : Validée — PRD v0.3 (EPIC J : J-01 à J-03, EPIC G : G-05), décisions produit D-1 et D-8 arbitrées le 2 octobre 2026.
**État de validation** : approuvée par mandat explicite de l'utilisateur (« own spec 060 end to end, work autonomously »).
**Workflow continu** : oui. Aucun marqueur `[NEEDS CLARIFICATION]` : les points ouverts sont tranchés dans la section « Décisions » et documentés dans `research.md`.

## Pourquoi cette spec

La spec 037 a livré les tarifs par plan et par pays, la règle du lead facturable, des brouillons mensuels `draft_not_billable` et les packs de leads, sans aucune émission de facture. La décision D-8 du PRD v0.3 fixe la **facturation manuelle** comme mode de paiement des courtiers au lancement : la finance émet la facture du mois, le courtier paie par virement ou mobile money **hors plateforme**, la finance constate le paiement. Le paiement en ligne (J-04) reste hors périmètre et fera l'objet d'une spec dédiée.

Le scénario SC-08 du PRD exige : « la finance émet la facture du mois (PDF numéroté) et enregistre le paiement reçu hors plateforme ». G-05 exige une vue facturation pour **tous les plans** (Starter compris), alors qu'aujourd'hui le relevé n'est visible que dans `/crm` (Pro et plus).

## Surfaces impactées

| Surface | Impact |
|---|---|
| Web Publique Client | **Aucun.** Rien n'est exposé au visiteur. `apps/public` n'est pas modifié. |
| Back-office Plateforme (admin) | Onglets « Factures » et « Comptes » dans `/billing` : émission, PDF, paiements, avoirs, état des comptes, pack lié à une facture. |
| Broker Back-office | Nouvelle page `/billing` (tous plans) : relevé du mois, factures et avoirs avec téléchargement PDF via proxy serveur, solde, packs. Entrée « Facturation » dans le menu Compte. |
| Backend API | Service d'émission, numérotation, PDF, paiements manuels, avoirs, états des comptes, routes admin et courtier. |
| Shared packages | Contrats `billing.contracts.ts` étendus, matrice RBAC (`billing:*` affinés). |
| Base de données / Prisma | Migration `0027_b2b_invoicing` : `IssuedInvoice`, `InvoicePayment`, `CreditNote`, `InvoiceNumberSequence`, colonne `LeadPack.invoiceId`, triggers d'immuabilité. |
| Runtime / Docker | Variables d'environnement optionnelles de mentions légales et de TVA (aucun nouveau service). |

Les parcours visiteur et les parcours authentifiés admin / courtier restent séparés applicativement.

## Cadre constitutionnel

- **Principe I (positionnement)** : AssurMatch facture une prestation technique B2B (abonnement à la plateforme, leads qualifiés). Elle **n'encaisse aucune prime**, ne vend aucune assurance et ne prend aucune commission sur un contrat. Chaque facture le rappelle dans ses mentions.
- **Paiement en ligne** : interdit dans cette spec. `payments_enabled` reste `false` ; aucune carte, aucun lien de paiement, aucun prestataire de paiement. Le paiement est constaté *a posteriori* par la finance (virement bancaire, mobile money, chèque, autre) avec une référence externe.
- **Principe III (activation progressive)** : toutes les mutations restent derrière `billing_enabled` (global, sensible, désactivé par défaut, activable uniquement via la politique de conformité auditée).
- **Principe IV (sécurité)** : MFA obligatoire ; RBAC par permission ; un courtier ne voit que les factures de son tenant ; le PDF n'est jamais servi par une URL publique (proxy serveur avec la session httpOnly).
- **Principe VI (historique opposable)** : une facture émise est **immuable** (numéro, lignes, montants, mentions, PDF et empreinte SHA-256). Elle n'est jamais supprimée : on l'annule par un **avoir** numéroté. Les paiements sont des écritures en ajout seul. Garanties applicatives et triggers PostgreSQL.
- **Audit** : émission, refus, paiement, avoir, téléchargement de PDF, lecture d'état des comptes, attribution de pack liée à une facture, notification.
- **IA** : aucune. **Routage** : aucun impact.

## Exigences fonctionnelles

### J-01 — Émission de la facture mensuelle depuis le brouillon

- **FR-01** Un `finance_admin` ou un `super_admin` (MFA vérifiée) émet une facture à partir d'un brouillon mensuel existant (`DraftInvoice`) avec un motif.
- **FR-02** Numérotation séquentielle **par pays et par année**, sans trou : `CI-2026-000001`, `SN-2026-000001`. Les avoirs ont leur propre série : `CI-AV-2026-000001`. L'allocation du numéro et l'insertion de la facture sont atomiques (transaction ; contrainte d'unicité).
- **FR-03** La facture fige un instantané : partenaire (raison sociale, nom commercial, ville, numéro d'immatriculation), période, plan, lignes, sous-total HT, taux et montant de TVA, total TTC, devise **XOF**, échéance, mentions de l'émetteur.
- **FR-04** Montants en XOF entiers (pas de centimes). Les lignes « crédits pack » et « contestations acceptées » sont reprises à titre informatif (montant 0, déjà déduites), ce qui garantit `sous-total HT = total du brouillon` arrondi.
- **FR-05** TVA par pays lue dans la configuration : défauts **CI 18 %** et **SN 18 %**, surchargeables par `ASSURMATCH_INVOICE_<PAYS>_VAT_RATE`. Ces valeurs sont **à valider par la comptabilité** avant la mise en production. Un pays sans taux configuré ne peut pas être facturé.
- **FR-06** Mentions légales de l'émetteur lues dans l'environnement (`ASSURMATCH_INVOICE_ISSUER_*`, surchargeables par pays). **Aucune donnée légale n'est inventée** : une mention absente apparaît comme `[A COMPLETER]`, la facture porte `legalMentionsComplete = false` et le PDF affiche « Document non valable : mentions légales à compléter ». En `preproduction` / `production`, l'émission est refusée tant que les mentions sont incomplètes.
- **FR-07** PDF A4 généré côté serveur sans nouvelle dépendance (écrivain PDF minimal interne, polices standard Helvetica, encodage WinAnsi), stocké via le port de stockage documentaire existant (`DocumentStoragePort` : mémoire, disque ou S3). L'empreinte SHA-256 est enregistrée et vérifiée à chaque téléchargement.
- **FR-08** Une seule facture active (non annulée) par brouillon (partenaire + période). Un brouillon vide (sous-total ≤ 0) n'est pas facturable. Le recalcul d'un brouillon déjà facturé est ignoré (le brouillon reste cohérent avec la facture).
- **FR-09** Un **avoir** total annule une facture émise non payée : numéro dédié, motif obligatoire, PDF, statut de la facture → `cancelled`. Aucune suppression. Une facture ayant reçu un paiement ne peut pas être annulée par avoir dans cette version (régularisation hors plateforme, voir Limites).
- **FR-10** Notification in-app au courtier (scope = tenant) à l'émission d'une facture (`invoice_issued`) et d'un avoir (`credit_note_issued`). Un échec de notification est audité et ne bloque pas l'émission.

### J-02 — Paiement manuel et état des comptes

- **FR-11** La finance enregistre un paiement reçu hors plateforme : montant (XOF entier > 0), date de réception (non future), moyen (`bank_transfer`, `mobile_money`, `cheque`, `other`), référence externe, note facultative.
- **FR-12** Statuts : `issued` → `partially_paid` → `paid`. Un paiement supérieur au reste dû, ou sur une facture annulée ou soldée, est refusé (409). Les paiements sont immuables.
- **FR-13** État des comptes par courtier : écritures chronologiques (facture = débit, avoir et paiement = crédit), solde courant, totaux facturé / crédité / payé, solde dû.

### J-03 — Pack de leads après paiement constaté

- **FR-14** L'attribution de pack existante accepte un `invoiceId` facultatif. Lorsqu'il est fourni, la facture doit appartenir au partenaire et être `partially_paid` ou `paid` ; le lien est persisté (`LeadPack.invoiceId`) et audité. La finance peut attribuer un pack (permission `billing:pack_grant`). Aucun paiement n'est capturé par l'attribution.

### G-05 — Vue facturation courtier pour tous les plans

- **FR-15** Page courtier `/billing` accessible en Starter, Pro et Enterprise : relevé du mois (spec 037), factures et avoirs avec téléchargement PDF, solde dû, packs et crédits restants.
- **FR-16** Lecture réservée aux rôles `broker_owner_starter`, `broker_owner_pro`, `broker_manager`, `broker_read_only` (permission `billing:read_own`). `broker_agent` est refusé (403 audité), y compris sur le relevé existant.
- **FR-17** Le PDF est servi par un route handler Next (`/billing/invoices/[id]/pdf`, `/billing/credit-notes/[id]/pdf`) qui relaie la session httpOnly vers l'API ; l'API vérifie le tenant. Un courtier ne peut jamais lire la facture d'un autre tenant (404 audité, sans révéler l'existence).

### RBAC

| Permission | Rôles | Usage |
|---|---|---|
| `billing:read` | finance_admin, super_admin | lecture admin factures, PDF, états des comptes |
| `billing:invoice_issue` | finance_admin, super_admin | émission |
| `billing:payment_record` | finance_admin, super_admin | paiements manuels |
| `billing:credit_note` | finance_admin, super_admin | avoirs |
| `billing:pack_grant` | finance_admin, super_admin | attribution de pack |
| `billing:*` | super_admin | tarifs (inchangé) |
| `billing:read_own` | broker_owner_starter, broker_owner_pro, broker_manager, broker_read_only | vue facturation courtier |

Un admin limité par pays (`countryScopes`) ne voit et ne mute que les factures de ses pays.

## Scénarios et critères d'acceptation

1. **Given** `billing_enabled` actif, un tarif CI et un brouillon calculé, **When** la finance émet la facture, **Then** elle reçoit `CI-2026-000001`, statut `issued`, TVA 18 %, total TTC = HT + TVA, un PDF commençant par `%PDF-` est stocké, l'action est auditée et le courtier reçoit une notification in-app `invoice_issued`.
2. **Given** une facture émise, **When** on tente de réémettre le même brouillon, **Then** 409 ; **When** on tente de modifier ses lignes en base, **Then** le trigger refuse la mise à jour.
3. **Given** une facture de 59 000 XOF TTC, **When** la finance enregistre 20 000 puis 39 000, **Then** le statut passe à `partially_paid` puis `paid` ; **When** elle enregistre 1 XOF de plus, **Then** 409.
4. **Given** une facture non payée, **When** la finance émet un avoir avec motif, **Then** l'avoir `CI-AV-2026-000001` est créé, la facture passe `cancelled`, le solde du courtier redevient nul, le brouillon peut être refacturé avec le numéro suivant.
5. **Given** une facture payée, **When** la finance attribue un pack avec `invoiceId`, **Then** le pack est lié à la facture ; **Given** une facture non payée, **Then** 409.
6. **Given** un courtier Starter owner, **When** il ouvre `/billing`, **Then** il voit le relevé, ses factures, le solde et peut télécharger le PDF ; **Given** un `broker_agent`, **Then** 403 ; **Given** un autre tenant, **Then** 404 sur le PDF.
7. **Given** un `support_admin`, **When** il appelle une route d'émission, de paiement ou d'avoir, **Then** 403 audité. **Given** `billing_enabled` désactivé, **Then** 422.
8. **Given** des mentions légales absentes en environnement local, **Then** la facture est émise avec `legalMentionsComplete=false` et le PDF porte l'avertissement ; **Given** `APP_ENV=production`, **Then** l'émission est refusée (422).

## Hors périmètre

- Paiement en ligne des abonnements et packs (J-04, D-8), prélèvement, rapprochement bancaire automatique.
- E-mail de facture (le module e-mail n'est pas modifié ; la notification est in-app).
- Avoirs partiels, remboursements, annulation d'un paiement enregistré par erreur, relances automatiques.
- Facturation électronique certifiée (normes fiscales locales) : à évaluer par la comptabilité.

## Limites connues

- Les taux de TVA et les mentions légales sont des valeurs de configuration à faire valider par la comptabilité et le juridique (CI et SN).
- Un paiement saisi par erreur ne peut pas être annulé dans l'interface : correction par écriture comptable hors plateforme et note d'audit (spec ultérieure).
