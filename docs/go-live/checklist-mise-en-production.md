# Checklist de mise en production — AssurMatch (CI puis Sénégal)

Ce document regroupe **toutes les opérations humaines** restantes, celles qu'aucun commit ne peut faire. Il suit les jalons du PRD v0.3 §11 (J1 à J5).

Le code des specs 050 à 057 et 060 est intégré sur la branche ; les specs 058, 059 et 061 sont en cours de finalisation. Chaque ligne renvoie au runbook ou à la spec qui détaille la procédure.

Légende : 🔴 bloquant pour le pilote fermé (J4) · 🟠 bloquant pour l'ouverture publique (J5) · 🟢 recommandé.

## 1. Décisions à prendre

| # | Décision | Responsable | Effet |
|---|---|---|---|
| 1.1 🔴 | Nom de domaine de production (D-10) et sous-domaines : public, courtiers, admin, API | Direction | Variables `PROD_*_URL`, DNS, TLS, liens des e-mails |
| 1.2 🔴 | Fournisseur d'e-mail transactionnel (domaine expéditeur avec SPF, DKIM et DMARC) | Direction et tech | `EMAIL_*`, fin du mode aperçu (`docs/runbooks/email-mode-toggle.md`) |
| 1.3 🟠 | Hébergeur et région des données (VPS, stockage S3) | Direction et DPO | Contrats de sous-traitance (DPA), déclarations |

## 2. Juridique et conformité (EPIC L)

| # | Action | Responsable | Référence |
|---|---|---|---|
| 2.1 🟠 | Mentions légales complètes (société, RCCM, siège, directeur de publication, hébergeur), avec surcharge CI et SN | Juridique | `apps/public/app/content/legal/` |
| 2.2 🟠 | Politiques de confidentialité CI (ARTCI) et SN (CDP) : responsable de traitement, DPO, durées, sous-traitants, transferts | Juridique, DPO | idem |
| 2.3 🟠 | Déclaration ARTCI (loi 2013-450) et CDP (loi 2008-12) | DPO | — |
| 2.4 🔴 | DPA avec l'hébergeur, le fournisseur d'e-mail, le stockage, et l'IA si elle est activée | Juridique | — |
| 2.5 🔴 | Contrat de partenariat courtier (version 1) : rôle technique, prix des leads, litiges, SLA, données | Juridique, commercial | Enregistré par l'admin sur la fiche courtier (spec 051) |
| 2.6 🔴 | Textes de consentement FR et EN par pays, validés puis publiés par la conformité | Conformité | Écran admin Consentements (spec 050) |
| 2.7 🟠 | Durées de rétention par pays validées, qui remplacent les valeurs provisoires | Juridique | `/compliance/retention` (spec 046) |
| 2.8 🟠 | Avis écrit sur le positionnement d'intermédiaire au regard de la CIMA, notamment pour la proposition non contractuelle relayée (spec 055) | Juridique | — |
| 2.9 🔴 | Mentions légales de facturation : `ASSURMATCH_INVOICE_*`, TVA CI et SN, délai de paiement | Comptabilité | Spec 060 (émission refusée en production tant que ces champs sont incomplets) |

## 3. Infrastructure (spec 057, runbooks)

| # | Action | Référence |
|---|---|---|
| 3.1 🔴 | Provisionner le VPS de production, Docker et l'utilisateur de déploiement | `docs/runbooks/deployment-production.md` |
| 3.2 🔴 | DNS (4 enregistrements) et certificats TLS (certbot) ; nginx depuis le modèle versionné | `deploy/nginx/`, `docs/runbooks/nginx-config.md` |
| 3.3 🔴 | Enregistrer le runner `assurmatch-production`, et réenregistrer `assurmatch-preprod` (K-03) | `docs/runbooks/deployment.md` |
| 3.4 🔴 | Environnement GitHub `production`, avec relecteurs obligatoires | idem |
| 3.5 🔴 | Variables de dépôt : `PROD_API_URL`, `PROD_PUBLIC_URL`, `PROD_BROKER_URL`, `PREPROD_API_URL`, `PREPROD_PUBLIC_URL`, `PREPROD_BROKER_URL` | `docs/preproduction/environments.md` |
| 3.6 🔴 | Fichiers d'environnement par conteneur (mode 0600) : secrets, `BROKER_APP_URL`, `APP_BASE_URL`, `PUBLIC_APP_URL`, `TRUSTED_PROXY_HOPS` | `.env.production.*.example` |
| 3.7 🔴 | Bucket S3 et clés ; `ASSURMATCH_DOCUMENT_STORAGE=s3` ; ClamAV (`ASSURMATCH_ANTIVIRUS=clamav`) | `quote-documents.config.ts`, compose de production |
| 3.8 🔴 | Premier déploiement, puis `npm run ops:bootstrap-super-admin` et première connexion avec MFA | `docs/runbooks/bootstrap-admin.md` |
| 3.9 🔴 | Worker unique démarré et sain (battement de cœur) | `docs/runbooks/worker.md` |
| 3.10 🟠 | Sauvegardes chiffrées hors site et test de restauration chronométré | `docs/runbooks/backup-restore.md` (spec 058) |
| 3.11 🟠 | Supervision : suivi d'erreurs, Uptime Kuma, alertes | Spec 058 |
| 3.12 🟠 | Test d'intrusion externe, puis correction des failles critiques et élevées | `docs/security/pentest-checklist.md` (spec 058) |

## 4. Paramétrage métier dans l'admin (aucun SQL)

À dérouler pour la CI, puis pour le Sénégal.

1. 🔴 Lancer le seed de référence (`npm run seed:reference`). Il charge CI et SN, Auto et Voyage, et les modèles de consentement en brouillon.
2. 🔴 **Catalogue** (spec 050) :
   - régime CIMA ;
   - pays en statut interne, flag `country_broker_onboarding_enabled` ;
   - liaisons Auto et Voyage ;
   - consentements FR et EN publiés ;
   - formulaires FR et EN publiés.
3. 🔴 **Courtiers** (spec 051), de 3 à 5 par pays :
   - candidature convertie, ou création directe ;
   - licence avec preuve acceptée, puis validée ;
   - couverture, contrat, propriétaire invité ;
   - passage en « Actif test », puis en « Actif public ».
4. 🔴 **Offres** (spec 052) : saisies par les courtiers dans « Mes offres », puis validées par la conformité.
5. 🟠 **Flags globaux** : `public_comparator_enabled` et `quote_request_enabled`.
6. 🟠 **Ouverture publique** : `country_public_enabled`, une fois la checklist d'activation entièrement verte. C'est le jalon J5, réservé à la conformité.
7. 🟢 **Facturation** : activer `billing_enabled` par le chemin de conformité audité, puis émettre les factures mensuelles (spec 060) :
   `npm run ops:apply-flag-policy -- --flag billing_enabled --value true --reference <réf. décision> --approved-by "<nom, fonction>" --reason "<motif>"`.
8. 🟢 **Enquête de satisfaction** (spec 048) : même commande avec `--flag satisfaction_survey_enabled`, une fois le texte de consentement validé. L'API applique la valeur sous 30 s (`ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS`), le worker au cycle suivant.

## 5. Recette avant ouverture

| # | Vérification | Référence |
|---|---|---|
| 5.1 🔴 | Scénario de bout en bout réussi sur la préproduction : SC-01 à SC-08 (clôture, enquête, facture et paiement compris), avec les e-mails réels | Spec 059 (`npm run test:e2e:stack`) |
| 5.2 🔴 | Cas interdits (SC-09) : pays fermé, absence de consentement, courtier suspendu, isolation | idem |
| 5.2b 🔴 | Exploitation (SC-10) : sondes `/healthz` et `/readyz` et battement du worker sont automatisés (`ops-health.spec.ts`) ; restauration de sauvegarde chronométrée, alertes et exercice d'incident restent manuels | Spec 059, `docs/runbooks/backup-restore.md`, `docs/runbooks/worker.md` |
| 5.2c 🟠 | Charge (M-03) : `npm run test:load` sur la préproduction, 50 req/s et p95 < 800 ms sur le catalogue et la soumission de devis | Spec 059 research R10 |
| 5.3 🟠 | Pilote fermé (J4) : 2 semaines sans incident critique, SLA mesuré, 0 écart de conformité | PRD v0.3 §11 |
| 5.4 🟠 | Go/no-go signé | `specs/013-preproduction-launch-readiness/checklists/go-no-go.md` |
