# Scénario E2E — Courtier ajouté → société configurée → offres validées → visiteur → devis → réponse

Mis à jour le 2026-10-08. Remplace la version du 2026-09, dont les écarts (onboarding du courtier, offres en libre-service, réponse au visiteur) sont comblés par les specs 051 à 055, 059 et 060.

Surfaces : Back-office Admin (3602), Broker Back-office (3603), Web Publique (3601), API (3600), Mailpit (8025).

## À savoir avant de commencer

- **Qui valide les produits ?** Il y a deux niveaux.
  - Le **catalogue** (pays, produits Auto/Voyage, formulaires de devis, consentements, flags) appartient à la plateforme. Seule l'équipe admin y touche.
  - Les **offres** du courtier (ses « produits » : garanties, prix indicatif, assureur) sont créées par le courtier, puis **validées par un Compliance Admin AssurMatch**. Tant qu'elle n'est pas validée, l'offre n'apparaît pas au public. Le courtier ne peut ni publier ni valider lui-même.
- **Le visiteur ne se connecte pas.** Décision D-3 (spec 054) : pas de compte visiteur. Il remplit un devis sans compte, puis revient dans son espace de suivi par un **lien magique reçu par e-mail** (Mailpit en local).
- Les comptes admin et courtier passent par : e-mail d'activation, mot de passe, enrôlement **MFA TOTP**. Le secret TOTP s'affiche une seule fois ; notez-le (ou ajoutez-le à une application d'authentification). Les sessions durent 15 minutes.
- Le travail de la file d'e-mails est fait par le worker du lanceur (toutes les 10 s). Un e-mail peut mettre quelques secondes à arriver dans Mailpit.

## Deux façons de l'exécuter

**A. Automatisé (pile Docker vierge, déjà écrit)** : `tests/e2e/scenario-core.spec.ts` couvre SC-01 à SC-08 en séquence.

```powershell
npm run test:e2e:stack
```

**B. Manuel en local** (ce document). Démarrer sans `ASSURMATCH_LOCAL_DEMO_SEED` : le seed démo crée des courtiers déjà actifs et fausserait le test.

```powershell
$env:LOCAL_BOOTSTRAP_ADMIN_EMAIL = "admin@assurmatch.local"
$env:LOCAL_BOOTSTRAP_ADMIN_PASSWORD = "<12+ caractères>"
cmd /c launch-local.bat
```

## Étapes

| # | Acteur | App | Action | Résultat attendu |
|---|--------|-----|--------|------------------|
| **0. Plateforme (une fois)** | | | | |
| 1 | Super Admin | Admin | Se connecter, enrôler la MFA | Dashboard admin visible |
| 2 | Super Admin | Admin | Ouvrir les flags globaux : `public_comparator_enabled`, `quote_request_enabled`, `starter_portal_enabled`, `broker_dashboard_enabled` | Chaque bascule demande un motif et est auditée |
| 3 | Super Admin | Admin | Publier le consentement `lead_transmission` de CI en FR (et EN) | Consentement « publié » |
| 4 | Super Admin | Admin | Ouvrir le pays CI et les produits Auto et Voyage : publier un formulaire de devis par produit et par langue, activer les flags produit (public, comparaison, devis), désactiver `product_manual_review_required`, passer les produits en `public` | Checklist du pays : plus de « formulaire/consentement manquant » |
| 5 | Super Admin | Admin | Pays CI : statut `internal` puis `pilot`, activer les flags pays (comparaison, devis, onboarding courtier) | Le pays est proposé dans la candidature courtier |
| **1. Ajout du courtier** | | | | |
| 6 | Candidat courtier | Public | `/courtiers/candidature` : société, pays CI, contact, n° de licence + expiration, produits Auto et Voyage, plan Starter, consentement, envoi | Page « Candidature reçue » avec une référence `PA-…` |
| 7 | Super Admin | Admin | `/partners/applications` → ouvrir la candidature → « Passer en examen » → « Convertir en courtier » (motif obligatoire) | Candidature « Convertie », e-mail de décision au candidat |
| 8 | Super Admin | Admin | Fiche du courtier : téléverser la preuve d'agrément PDF et l'accepter, **valider la licence**, autoriser pays CI + produits Auto et Voyage, téléverser et accepter le contrat signé puis l'enregistrer | Carte « Conditions d'activation » sans condition manquante |
| 9 | Super Admin | Admin | Même fiche : inviter le propriétaire (e-mail + nom), puis « Envoyer en vérification » → « Passer en Actif public » | Statut « Actif public » ; e-mail d'activation dans Mailpit |
| **2. Le courtier se connecte et configure sa société** | | | | |
| 10 | Propriétaire | Broker | Ouvrir le lien d'activation (Mailpit, `…:3603/activate?token=`), choisir un mot de passe, enrôler la MFA | « Portail courtier » visible |
| 11 | Propriétaire | Broker | `/company` : contact commercial, présentation, assureurs partenaires → Enregistrer | Valeurs conservées après rechargement. L'identité légale (raison sociale, licence) ne se modifie pas librement : demande à valider par AssurMatch |
| 12 | Propriétaire | Broker | `/licenses` | Licence « Valide » avec date d'expiration |
| 13 | Propriétaire | Broker | `/team` : inviter un agent (rôle `broker_agent`) | E-mail d'invitation vers l'app courtier |
| **3. Le courtier ajoute ses produits (offres)** | | | | |
| 14 | Propriétaire | Broker | `/offers/new` : périmètre « Côte d'Ivoire — Assurance auto », nom, assureur, description, niveau, résumé libre **et liste de garanties** (section « Garanties (liste détaillée) » : une ligne vide est déjà affichée, « Ajouter une garantie » en ajoute ; le résumé libre seul ne suffit pas), exclusions, franchise, délai, prix indicatif min/max (XOF, par an), flexibilité de paiement, dates de validité, source de l'information → « Créer le brouillon » | Brouillon créé |
| 15 | Propriétaire | Broker | Fiche de l'offre → « Soumettre à validation » | « En attente de validation par AssurMatch » ; l'offre n'est pas encore publique |
| **4. Validation par la plateforme** | | | | |
| 16 | Super Admin | Admin | `/users` : créer un utilisateur avec le rôle `compliance_admin`, activer son compte (e-mail + MFA) | Second compte admin actif. Un compte distinct est nécessaire pour la décision de conformité (quatre yeux) |
| 17 | Compliance Admin | Admin | `/offers` : l'offre est dans la file → fiche → « Valider et publier » (motif obligatoire) | L'offre passe publique ; bouton « Suspendre » disponible |
| 18 | Compliance Admin | Admin | Pays CI : flag `country_public_enabled`, statut `public` | Checklist : « Aucun contrôle bloquant ». `/pays/CI` répond côté public |
| **5. Le visiteur demande un devis** | | | | |
| 19 | Visiteur | Public | `/pays/CI` → « Comparer les offres » → Assurance auto | L'offre du courtier est listée, marquée **indicative**, avec le « Courtier partenaire responsable » |
| 20 | Visiteur | Public | « Demander un devis » : usage du véhicule, marque, ville, préférence de contact → Continuer → nom, e-mail, téléphone → « Vérifier ma demande » | Le consentement **nomme le courtier destinataire** |
| 21 | Visiteur | Public | Cocher le consentement → « Envoyer ma demande » | Référence `QR-…` et nom du courtier affichés |
| 22 | Visiteur | Mailpit | Ouvrir l'e-mail de confirmation, cliquer le lien de suivi `…/demandes-de-devis/QR-…?token=…` | Espace de suivi : référence + courtier (c'est la « connexion » du visiteur) |
| **6. Le courtier traite le lead** | | | | |
| 23 | Propriétaire | Broker | `/leads` → ouvrir le lead | Carte « Contact consenti » : e-mail et téléphone du visiteur |
| 24 | Propriétaire | Broker | « Accepter » | Le visiteur reçoit un e-mail « prise en charge » |
| 25 | Propriétaire | Broker | « Répondre au visiteur » : message, prix min/max, devise, garanties, validité, PDF → « Envoyer la proposition au visiteur » | « Propositions actives : 1 / 10 » ; e-mail au visiteur |
| 26 | Visiteur | Public | Rouvrir le lien de suivi | « Une proposition de courtier est disponible », mention « non contractuelle, à confirmer par le courtier ». **Aucun** vocabulaire « souscrire / acheter / payer » |
| 27 | Visiteur | Public | « Je suis intéressé, rappelez-moi » + créneau → « Envoyer ma réponse au courtier » | Réponse transmise |
| 28 | Propriétaire | Broker | Fiche du lead | Réponse du visiteur dans l'historique ; le statut n'est jamais changé d'office |
| **7. Clôture, avis, facturation (SC-08)** | | | | |
| 29 | Propriétaire | Broker | « Clôturer » → issue « Gagné » + commentaire | Lead clôturé ; le visiteur est prévenu **sans** l'issue commerciale |
| 30 | Visiteur | Mailpit/Public | Ouvrir l'e-mail « Votre avis… » (`/avis/SF-…?token=`), noter, envoyer | « Merci pour votre avis » ; lien à usage unique |
| 31 | Finance (Super Admin) | Admin | `/billing` : tarif Starter CI, recalcul des brouillons, émission de la facture, enregistrement du paiement reçu hors plateforme | Facture `CI-AAAA-NNNNNN` « payée » ; visible côté courtier, « réglée » |

Les flags d'avis (spec 048) et de facturation (spec 060) n'ont volontairement pas de bascule dans le back-office. Pour l'étape 29 à 31 en local, appliquer la politique auditée : `scripts/ops/apply-flag-policy.ts`.

## Cas interdits à rejouer (SC-09, `forbidden-cases.spec.ts`)

- Pays fermé : aucune offre ni formulaire de devis.
- Devis sans consentement : refusé.
- Courtier suspendu : ses offres et ses leads disparaissent.
- Isolation : un courtier ne voit jamais les leads ni les offres d'un autre.

## Points à vérifier à l'œil (non couverts par les assertions)

- Aucun e-mail ni écran ne cite une garantie ou un prix comme contractuel.
- Rien de personnel du visiteur dans l'URL (le token seul est autorisé) ni dans les journaux.
- Les trois apps ne partagent aucun cookie : se connecter à l'admin ne connecte pas au portail courtier.
