# Recherche et décisions : Facturation B2B manuelle (spec 060)

## R-1 — Génération PDF sans nouvelle dépendance

- **Décision** : écrivain PDF 1.4 interne (`backend/src/modules/billing/invoice-pdf.ts`), texte et filets uniquement, polices standard `Helvetica` / `Helvetica-Bold` (aucune police embarquée), encodage `WinAnsiEncoding`, pagination A4 automatique.
- **Pourquoi** : une facture est un document tabulaire simple. `pdfkit` (~ 7 Mo avec ses polices AFM et `fontkit`) ou `pdf-lib` ajouteraient une surface de dépendance et de licence pour un besoin couvert en ~200 lignes. Le PDF est déterministe (aucune date de génération variable), ce qui rend l'empreinte SHA-256 stable et testable.
- **Encodage** : les caractères Latin-1 (accents français) sont encodés directement (WinAnsi = Latin-1 sur ces plages). Les espaces insécables fines (U+202F) des formats `fr-FR` sont remplacées par des espaces simples ; tout autre caractère hors Latin-1 devient `?`. Les chaînes sont échappées (`\`, `(`, `)`).
- **Alternatives rejetées** : rendu HTML → PDF via navigateur (Playwright/Chromium en production : lourd, non déterministe) ; `pdfkit` (poids, polices) ; `pdf-lib` (plus léger mais inutile ici).

## R-2 — Numérotation séquentielle sans trou

- **Décision** : table `InvoiceNumberSequence(countryCode, year, kind, lastValue)` ; allocation par `upsert` avec `increment` **dans la même transaction interactive** que l'insertion de la facture et l'écriture du PDF. En cas d'échec (stockage, contrainte), la transaction est annulée et le numéro n'est pas consommé.
- **Format** : `{PAYS}-{AAAA}-{000001}` pour les factures, `{PAYS}-AV-{AAAA}-{000001}` pour les avoirs. L'année est celle de l'émission (UTC).
- **Concurrence** : PostgreSQL verrouille la ligne de séquence pendant la transaction ; contraintes `UNIQUE(number)` en filet de sécurité. Le dépôt mémoire (tests) alloue de façon synchrone.
- **Note** : `PrismaService.transaction()` existant ne propage pas le client transactionnel ; le dépôt de facturation utilise directement `$transaction(async (tx) => …)` du client Prisma.

## R-3 — Immuabilité

- **Applicatif** : aucune méthode de dépôt ne modifie les champs figés ; seules les transitions `status`, `amountPaid`, `creditNoteId`, `cancelledAt`, `updatedAt` sont possibles, sous condition (verrou optimiste sur `amountPaid` / `status`).
- **Base** : triggers PL/pgSQL `BEFORE UPDATE OR DELETE` sur `IssuedInvoice` (refus de toute modification des colonnes figées, de toute modification d'une facture annulée et de toute suppression), et refus de tout `UPDATE`/`DELETE` sur `CreditNote` et `InvoicePayment`.
- **Document** : PDF stocké sous une clé opaque (`invoice-<uuid>.pdf`), empreinte SHA-256 en base, vérifiée au téléchargement (500 audité si altération).

## R-4 — TVA et mentions légales (CI, SN)

- Défauts de configuration : **CI 18 %**, **SN 18 %** (taux normaux connus de TVA ; **à valider par la comptabilité**, y compris l'éventuel régime applicable aux prestations numériques B2B). Surcharge : `ASSURMATCH_INVOICE_CI_VAT_RATE`, `ASSURMATCH_INVOICE_SN_VAT_RATE` ; un autre pays devient facturable dès que `ASSURMATCH_INVOICE_<PAYS>_VAT_RATE` est défini.
- Calcul : taux stocké en points de base (`vatRateBps = 1800`), `TVA = arrondi(HT × bps / 10000)`, montants XOF entiers.
- Mentions de l'émetteur : `ASSURMATCH_INVOICE_ISSUER_LEGAL_NAME`, `_ADDRESS`, `_RCCM`, `_TAX_ID`, `_EMAIL`, `_PAYMENT_INSTRUCTIONS`, chacune surchargeable par pays (`ASSURMATCH_INVOICE_CI_ISSUER_RCCM`…). Libellé d'identifiant fiscal : `NCC` (CI), `NINEA` (SN). Aucune valeur légale n'est codée en dur ; les manquants deviennent `[A COMPLETER]`.
- Échéance : `ASSURMATCH_INVOICE_PAYMENT_TERM_DAYS` (défaut 30).
- Production : `APP_ENV=production|preproduction` → émission refusée si mentions incomplètes (`ASSURMATCH_INVOICE_REQUIRE_LEGAL_MENTIONS=false` permet un essai explicite).

## R-5 — RBAC

- `finance_admin` n'avait que `billing:read`. Plutôt que `billing:*` (qui ouvrirait la modification des tarifs), on ajoute des permissions fines : `billing:invoice_issue`, `billing:payment_record`, `billing:credit_note`, `billing:pack_grant`. `super_admin` les obtient par `*:*`. La modification des tarifs reste `billing:*`.
- Courtiers : nouvelle permission `billing:read_own` pour owner (Starter, Pro), manager et read-only ; refusée à `broker_agent`. La table miroir `apps/broker/app/lib/broker-permissions.ts` est mise à jour (test de parité existant).

## R-6 — Relation avec les brouillons de la spec 037

- Les lignes `pack_credit` et `dispute_credit` du brouillon sont informatives (le total du brouillon les a déjà déduites). Elles sont reprises sur la facture avec un montant 0 et la mention « déjà déduit ».
- Le recalcul (`POST /admin/billing/invoices/recompute`) ignore un partenaire dont le brouillon du mois est déjà facturé (facture active), afin de ne pas consommer à nouveau des crédits pack ni désaligner brouillon et facture.

## R-7 — Notification

- `MessagingDispatchService.publishInApp` (scope = tenant courtier), injecté via un port minimal. Le module e-mail n'est pas modifié.
