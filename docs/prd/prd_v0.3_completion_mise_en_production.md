# PRD v0.3 — Complétion fonctionnelle et mise en production d'AssurMatch

**Nom de code :** AssurMatch
**Version :** v0.3 (complète le PRD v0.2 `docs/prd_plateforme_comparaison_assurances.md`, sans le remplacer)
**Date :** 2 octobre 2026
**Statut :** Proposition à valider (les décisions de la section 9 sont à trancher avant d'écrire les specs concernées)
**Autorité :** `.specify/memory/constitution.md` (v1.2.0) prime sur ce document en cas de conflit.

---

## 0. Pourquoi ce PRD

Le PRD v0.2 décrit la cible. La carte de couverture (`docs/prd_coverage_map.md`) considère le backlog des specs 001 à 049 comme presque terminé. Pourtant, un test de bout en bout simple échoue dès sa première étape :

> L'admin ajoute un courtier → le courtier se connecte et ajoute ses produits → un visiteur demande un devis → le courtier répond et le visiteur reçoit la réponse.

Un audit du code (le 2 octobre 2026, sur les quatre surfaces) explique cet écart : **la logique métier existe souvent, mais elle n'est pas exposée**. Selon les cas :

- le service de domaine n'est pas câblé dans `backend/src/modules/http-wiring/runtime-http-wiring.module.ts` ;
- la route HTTP existe mais aucun écran ne l'appelle ;
- l'écran existe mais il est en lecture seule ;
- la donnée nécessaire n'existe que dans le seed de démonstration, refusé en production.

Ce PRD décrit **tout ce qui manque** pour que :

1. les dix scénarios de bout en bout de la section 4 se déroulent sans intervention en base de données ni script manuel ;
2. la plateforme soit mise en production en respectant la constitution (périmètre MVP du PRD v0.2, §37).

---

## 1. Constat de départ (synthèse de l'audit)

| Domaine | Ce qui fonctionne | Ce qui bloque |
|---|---|---|
| Onboarding courtier (admin) | Création d'utilisateurs (`POST /admin/users`) avec `partnerTenantId` | Aucune route pour créer, modifier, activer ou suspendre un **PartnerTenant**, ses **licences**, ses **documents d'agrément** ou sa **couverture pays/produits**. `AdminPartnersController` et `PartnerLicensesController` existent mais ne sont pas câblés. Les candidatures (`/courtiers/candidature`) sont listables par API, mais elles n'ont pas d'écran et ne peuvent pas être converties en courtier. |
| Catalogue | Modèle pays/produits, flags, seed de référence (9 pays, 15 produits) | Pas de route admin pour les pays, les produits, les régimes réglementaires ni les textes de consentement (`AdminConsentTextsController` non câblé). Tous les flags sont à `false` et ne se changent qu'en base. Sans texte de consentement publié, **aucun formulaire de devis ne peut être publié en production**. |
| Offres | API admin `POST/PATCH /admin/offers`, `validate`, `suspend` | La page admin `/offers` est statique : aucune offre ne peut être créée ni publiée depuis l'interface. **Le courtier n'a aucune route ni page pour gérer ses offres** (PRD v0.2 §13 l'autorise pourtant). Le routage ignore `selectedOfferId`. |
| Parcours visiteur | Accueil → pays → produit → offres → comparaison → formulaire → consentement → soumission. Anti-spam, doublons, retrait du consentement. | Formulaires dynamiques présents seulement dans le seed démo. Le lien de suivi de l'e-mail n'a pas de jeton. La page de suivi n'appelle pas l'API de statut. Le courtier n'est jamais nommé (« courtier partenaire » codé en dur). Le formulaire est servi en français aux visiteurs anglophones. |
| Réponse courtier → visiteur | Le CRM enregistre statuts, notes, tâches et propositions (métadonnées) | **Aucun canal ne ramène la réponse au visiteur** : pas de notification après la soumission, pas d'exposition des propositions, pas de messagerie. La fiche CRM Pro n'affiche que l'e-mail et le téléphone **masqués**. Les propositions, documents, assignations et le Kanban ont une route mais pas d'écran. Les documents sont une simple chaîne `storageKey`, sans fichier. |
| Self-service courtier | Activation, connexion, MFA, mot de passe, notifications, préférences, IA, tableau de bord | Pas de profil société, pas de dépôt ni de renouvellement de licence, pas d'invitation d'équipe (`/team` est un placeholder), pas de facturation pour Starter, pas de demande de changement de plan. |
| Back-office admin (exploitation) | Utilisateurs, formulaires de devis, scoring, routage, facturation, rétention, IA, tableaux de bord | Les endpoints suivants ont une route mais **pas d'écran** (ou un écran statique) : demandes de devis, affectations, messages de contact, journaux d'audit, bascule des flags, anomalies de routage, intégrations partenaires. La revue manuelle d'une demande ne persiste pas. |
| Production | CI (vérifications, scan de secrets, images GHCR), Dockerfiles API/public/admin, runbooks | **Pas d'environnement de production.** L'app courtier n'est pas déployée (ni Dockerfile, ni conteneur, ni nginx). Les workers (e-mails, webhooks, enquêtes) ne sont pas planifiés : **aucun e-mail ne part**. Les files BullMQ ne sont jamais consommées. Pas de supervision ni de sauvegarde hors site. IP client falsifiable via `X-Forwarded-For`. E-mail envoyé depuis un Gmail personnel. Textes légaux à compléter, pas de déclaration ARTCI. Le premier Super Admin ne peut pas être créé en production. |

**Conséquence :** la carte de couverture doit être corrigée. Une capacité ne compte comme « implémentée » que si elle est **atteignable par son utilisateur cible, depuis son interface, sur une base sans seed de démonstration**.

---

## 2. Objectifs

| ID | Objectif | Mesure de réussite |
|---|---|---|
| OBJ-1 | Rendre chaque capacité métier atteignable par son utilisateur cible | 100 % des opérations P0 de la section 5 disponibles par l'interface, sans SQL ni script |
| OBJ-2 | Boucler le cycle demande → réponse sur la plateforme | Le visiteur voit sur son suivi, et reçoit par e-mail, le courtier nommé, la prise en charge et la proposition non contractuelle |
| OBJ-3 | Pouvoir lancer un pays et des produits sans données de démo | Le scénario SC-01 aboutit sur une base initialisée par le seul seed de référence |
| OBJ-4 | Disposer d'un environnement de production exploitable | Checklist go/no-go (spec 013) cochée à 100 %, supervision et sauvegardes testées |
| OBJ-5 | Prouver le tout par des tests automatisés de bout en bout | Les scénarios SC-01 à SC-10 tournent en CI contre une pile Docker complète |
| OBJ-6 | Rester conforme | 0 lead transmis sans consentement, 0 courtier non éligible routé, 0 action sensible non auditée, 0 donnée visiteur exposée à un courtier non assigné |

## 3. Périmètre

### 3.1 Inclus

- Exposition HTTP et interfaces (admin, courtier, public) des capacités métier existantes.
- Nouvelles capacités nécessaires aux scénarios :
  - offres gérées par le courtier ;
  - espace de suivi visiteur ;
  - réponse du courtier et notifications au visiteur ;
  - conversion d'une candidature en courtier ;
  - invitation d'équipe.
- Données de référence de production : pays de lancement, produits, textes de consentement, formulaires, textes légaux.
- Infrastructure de production, exploitation, sécurité, supervision, sauvegardes.
- Prérequis légaux et de conformité au lancement.
- Facturation B2B **manuelle** au lancement (factures émises, paiement enregistré par la finance).

### 3.2 Exclu (constitution, principes I et XI)

- Souscription, encaissement de primes, émission de contrat ou d'attestation, e-signature, sinistres, API assureur.
- Paiement en ligne des abonnements et des packs de leads. Une spec « paiements B2B » distincte viendra après le lancement (décision D-8).
- Toute activation d'un flag sensible (IA, multi-courtiers, SMS/WhatsApp, webhooks, purge) hors du chemin de conformité audité.
- CMS éditorial : les contenus légaux restent en TypeScript versionné ; une spec ultérieure pourra changer cela.

### 3.3 Cible de lancement (PRD v0.2 §37, à confirmer en D-1)

- **1 pays :** Côte d'Ivoire (CI, régime CIMA).
- **2 produits :** Automobile et Voyage.
- **3 à 5 courtiers agréés**, en plan Starter et Pro.
- IA désactivée au lancement, sauf décision contraire.
- Routage exclusif (multi-courtiers fermé).

---

## 4. Scénarios de bout en bout (critères d'acceptation du lancement)

Chaque scénario doit :

- passer manuellement en préproduction ;
- être automatisé en Playwright, en CI, contre une pile Docker complète (EPIC M) ;
- démarrer d'une base initialisée **uniquement** par le seed de référence et la création du premier Super Admin (EPIC K).

### SC-01 — Ouvrir un pays et ses produits (admin)
- **Given** un Super Admin (ou Admin Pays CI) connecté avec MFA.
- **When** il ouvre la CI et les produits Auto et Voyage, publie les textes de consentement, publie un formulaire de devis par produit (FR et EN), puis active les flags pays et produit.
- **Then** les pages publiques CI/Auto/Voyage sont visibles.
- **And** la checklist d'activation (`/activation-checklist`) passe au vert, en dehors des courtiers et des offres.
- **And** chaque action produit un AuditLog.

### SC-02 — Onboarder un courtier (admin)
- **Given** une candidature reçue via `/courtiers/candidature` (référence `PA-…`).
- **When** l'admin la consulte, la passe « En vérification », crée le PartnerTenant à partir d'elle, saisit la licence (numéro, autorité, expiration) et téléverse la preuve d'agrément. Un Compliance Admin valide ensuite la licence. L'admin définit la couverture (CI × Auto, Voyage), le plan (Starter ou Pro), le quota et la capacité, active le courtier, puis invite son propriétaire.
- **Then** le propriétaire reçoit un e-mail d'activation.
- **And** le courtier devient éligible au routage pour CI × Auto et Voyage.
- **And** la candidature passe à « Convertie ».
- **Alternatif :** l'admin crée le courtier sans candidature. Le résultat est le même.
- **Interdit :** sans licence validée, l'activation est refusée avec un motif explicite.

### SC-03 — Premier accès et self-service (courtier)
- **Given** l'invitation reçue.
- **When** le propriétaire active son compte, enrôle sa MFA, complète son profil société et invite un agent.
- **Then** l'agent reçoit son invitation et n'accède qu'aux leads qui lui sont assignés (Pro).
- **And** le propriétaire voit l'état de sa licence et sa date d'expiration.

### SC-04 — Le courtier gère ses offres
- **Given** un courtier actif couvert pour CI × Auto.
- **When** il crée une offre en brouillon (garanties, exclusions, franchise, prime indicative ou fourchette, validité) et la soumet.
- **Then** l'offre passe « En attente de validation » et apparaît dans la file admin.
- **When** l'admin la valide.
- **Then** elle s'affiche publiquement, marquée « offre indicative », avec le courtier responsable et la date de mise à jour.
- **Interdits :**
  - un courtier ne peut pas créer d'offre hors de sa couverture ;
  - une offre expirée disparaît du public ;
  - toute modification d'une offre publiée crée une nouvelle version, à valider.

### SC-05 — Demande de devis (visiteur)
- **Given** un visiteur anonyme, en FR ou en EN.
- **When** il compare des offres Auto, choisit l'offre du courtier X, remplit le formulaire dans sa langue et consent.
- **Then** le consentement **nomme le courtier destinataire** (ou explique la règle s'il y a routage automatique).
- **And** la confirmation affiche la référence `QR-…` et le courtier.
- **And** il reçoit un e-mail, dans sa langue, contenant un **lien de suivi qui fonctionne**.
- **And** le lead est routé vers X si X est éligible, sinon selon les règles, et le visiteur en est informé (décision D-4).

### SC-06 — Réponse du courtier (Starter et Pro)
- **Given** le lead assigné au courtier X.
- **When** X l'accepte.
- **Then** les coordonnées complètes du visiteur lui sont révélées (D-2).
- **And** le visiteur reçoit la notification « Votre demande est prise en charge par X ».
- **When** X envoie une proposition non contractuelle (message, prime indicative, PDF facultatif, validité).
- **Then** le visiteur reçoit un e-mail et voit la proposition dans son espace de suivi, avec la mention « proposition indicative à confirmer par le courtier ».
- **And** le statut CRM passe à « Devis envoyé ».

### SC-07 — Suite donnée par le visiteur
- **Given** une proposition reçue.
- **When** le visiteur répond depuis son espace de suivi : « Je suis intéressé, rappelez-moi », « Je ne donne pas suite » ou une question.
- **Then** le courtier est notifié, la réponse est historisée dans le lead et le statut est proposé au courtier (jamais appliqué automatiquement).
- **Interdits :**
  - aucune formulation « souscrire » ou « acheter » ;
  - la conclusion du contrat se fait hors plateforme, chez le courtier.

### SC-08 — Clôture, satisfaction et facturation
- **Given** un lead marqué Gagné ou Perdu.
- **Then** le visiteur reçoit l'enquête de satisfaction (si le flag est activé), et la page `/avis/{ref}` fonctionne.
- **And** le lead apparaît dans le relevé mensuel du courtier selon la règle du lead facturable.
- **And** la finance émet la facture du mois (PDF numéroté) et enregistre le paiement reçu hors plateforme.

### SC-09 — Cas interdits de conformité
- Une licence qui expire bloque le courtier pour le routage et produit une alerte de conformité.
- Un pays ou un produit désactivé bloque immédiatement le parcours public, sans transmission.
- Une demande sans consentement n'est pas routée, et le refus est audité.
- Un courtier Y ne peut voir ni le lead, ni les coordonnées, ni la proposition du courtier X (test RBAC).
- Un visiteur qui retire son consentement voit la demande clôturée chez le courtier, et reçoit un e-mail de confirmation.

### SC-10 — Exploitation
- **Given** la production.
- **When** un worker s'arrête ou une erreur 5xx survient, une alerte part. Pendant ce temps, la sauvegarde nocturne est copiée hors site et un test de restauration réussit.
- **When** l'opérateur déclenche un rollback.
- **Then** la version N-1 est restaurée sans perte de données, selon le runbook.

---

## 5. Exigences fonctionnelles par épique

Légende :

- **Surface** : PUB (Web Publique Client), ADM (Back-office Plateforme), BRK (Broker Back-office), API (Backend API), SHR (packages partagés), DB (Prisma et migrations), OPS (runtime et déploiement).
- **P0** = bloque un scénario ou la mise en production. **P1** = attendu au lancement si possible. **P2** = après le lancement.

### EPIC A — Onboarding et cycle de vie des courtiers (ADM, API, DB)

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| A-01 | Câbler la création, la modification et la consultation des PartnerTenant : raison sociale, nom commercial, pays, ville, RCCM, contacts administratifs et commerciaux, assureurs partenaires, conditions contractuelles | P0 | Service présent, non câblé |
| A-02 | Aligner les statuts sur le PRD §22 : Prospect, En vérification, Actif test, Actif public, Suspendu, Expiré, Résilié. Transitions contrôlées et motivées. « Actif test » reçoit des leads uniquement dans un mode de test (décision D-6) | P0 | 5 statuts techniques divergents |
| A-03 | Licences : créer, valider (Compliance Admin), suspendre, révoquer, renouveler. Historique. Blocage automatique à l'expiration (existant) | P0 | Service présent, non câblé ; pas de suspension ni de révocation |
| A-04 | Documents d'agrément : téléversement réel (stockage S3 et antivirus, comme les documents de devis), consultation tracée, persistés en base | P0 | Module en mémoire seulement |
| A-05 | Couverture : autoriser ou retirer le courtier par pays et par produit, avec motif et audit | P0 | Repository présent, non exposé |
| A-06 | Plan (Starter, Pro, Enterprise), quota de leads, capacité, SLA attendu : modifiables avec historique | P0 | Champ `plan` non modifiable |
| A-07 | Annuaire des courtiers (filtres par statut, pays, plan, expiration de licence) et fiche détaillée : licences, couverture, utilisateurs, offres, SLA, facturation, journal | P0 | Seulement le tableau SLA |
| A-08 | Candidatures : liste, détail, statuts (Reçue, En vérification, Refusée avec motif, Convertie), conversion en PartnerTenant prérempli, e-mail au candidat à chaque décision | P0 | Liste API sans écran ; pas de décision |
| A-09 | Invitation du propriétaire depuis la fiche courtier (sélecteur de courtier, plus de saisie d'UUID). Le contrat refuse un `partnerTenantId` inexistant | P0 | Champ UUID libre |
| A-10 | Activation du courtier conditionnée : licence valide, couverture définie, au moins un utilisateur propriétaire, conditions contractuelles acceptées (case cochée et date) | P0 | — |
| A-11 | Alertes automatiques d'expiration de licence à J-60, J-30 et J-7, envoyées à l'admin et au courtier | P1 | Alertes en lecture seule au tableau de bord |
| A-12 | Suspension rapide d'un courtier (principe II) : effet immédiat sur le routage et les offres publiques, réversible, auditée | P0 | — |

### EPIC B — Catalogue, consentements et activation (ADM, API, DB, OPS)

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| B-01 | Pays : création, édition (devise, langues, régime, mentions légales), statuts, flags pays (`country_*`) modifiables par l'admin avec audit | P0 | Non câblé ; page catalogue statique |
| B-02 | Produits : création, édition, liaison pays-produit (`CountryProduct`), flags produit (`product_*`) | P0 | Non câblé |
| B-03 | Régimes réglementaires persistés en base et administrables | P1 | En mémoire, non câblé |
| B-04 | Textes de consentement : versions, langues, publication par un Compliance Admin, empreinte figée. Le texte de transmission comporte le nom du destinataire, dans une variable | P0 | Contrôleur non câblé ; modèles jamais chargés par le seed |
| B-05 | Formulaires de devis : ajouter les champs génériques du PRD §16 (ville, préférence de contact, délai, langue préférée, source) et une version EN publiée par produit. Le site public transmet la langue | P0 | Seulement nom, e-mail, téléphone ; FR uniquement |
| B-06 | Validation du téléphone par pays (indicatif et longueur, sur la base de `Country`) | P1 | Longueur seulement |
| B-07 | Checklist d'activation actionnable : chaque ligne en échec mène à l'écran qui la corrige | P1 | Lecture seule |
| B-08 | Bascule des flags non sensibles depuis l'interface (avec motif). Les flags sensibles restent sur le chemin de conformité audité, et l'interface l'explique | P0 | PATCH câblé, interface en lecture seule |
| B-09 | Seed de référence de production : charger les modèles de consentement (brouillons), CI/Auto/Voyage et les liaisons pays-produit. Les flags restent fermés, l'admin les ouvre (SC-01) | P0 | Consentements et liaisons absents |

### EPIC C — Offres (ADM, BRK, API, PUB, DB)

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| C-01 | Interface admin des offres : liste filtrable, création, édition, validation, suspension, historique | P0 | Page statique ; API présente |
| C-02 | **Offres gérées par le courtier** : création et édition en brouillon dans sa couverture, soumission à validation, retrait. Champs du PRD §13 : assureur porteur, garanties, exclusions, franchises, plafonds, documents requis, délai, prime indicative ou fourchette, validité, source | P0 | Inexistant |
| C-03 | Validation admin obligatoire avant publication (OFFER-007). File « Offres à valider » avec comparaison des versions | P0 | Validation API seulement |
| C-04 | Versionnage : une modification d'offre publiée crée une version, la version publiée reste en ligne jusqu'à validation de la nouvelle (OFFER-008) | P1 | — |
| C-05 | Rappel au courtier avant l'expiration d'une offre (J-15) ; masquage automatique à l'expiration (existant) | P1 | Masquage OK |
| C-06 | Le routage tient compte de `selectedOfferId` : courtier de l'offre en priorité s'il est éligible, sinon routage standard et visiteur informé (D-4) | P0 | Ignoré |
| C-07 | Offres sponsorisées : saisies par l'admin uniquement, étiquetées publiquement (existant), flag `sponsored_offers_enabled` | P2 | — |

### EPIC D — Parcours visiteur et suivi (PUB, API)

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| D-01 | Le consentement de transmission nomme le courtier destinataire, ou décrit la règle de routage (constitution VIII, QUOTE-008) | P0 | Libellé générique |
| D-02 | La confirmation affiche le courtier (ou « en cours d'attribution ») et explique les étapes suivantes | P0 | « courtier partenaire » codé en dur |
| D-03 | **Espace de suivi visiteur** sans mot de passe (D-3) : accès par lien magique envoyé par e-mail, renvoyable depuis `/suivi` (référence et e-mail). Jeton à durée limitée, révocable, jamais dans les journaux applicatifs | P0 | Jeton à usage unique, perdu après l'écran de confirmation |
| D-04 | La page de suivi affiche le statut public réel (machine de statuts §7.2), le courtier nommé, la chronologie, les propositions, les messages, les documents et le retrait du consentement | P0 | Frise statique, aucun appel à l'API |
| D-05 | Lien de suivi des e-mails corrigé : jeton inclus et chemin localisé (`/demandes-de-devis/…` en FR, `/en/quote-requests/…`) | P0 | Sans jeton, chemin non localisé |
| D-06 | E-mails visiteur en FR ou EN selon la langue de la demande (stockée sur la demande) | P0 | FR uniquement |
| D-07 | Libellé d'e-mail correct pour `manual_review` et `duplicate` (pas de « transmise ») | P0 | Erroné |
| D-08 | Page `/avis/{ref}` et `/en/feedback/{ref}` pour l'enquête de satisfaction | P0 si l'enquête est activée | Lien en 404 |
| D-09 | E-mail de confirmation du retrait du consentement | P1 | Absent |
| D-10 | Demande d'accès, de rectification ou d'effacement en libre-service (formulaire `data_request`), traitée dans l'admin Rétention | P1 | Manuel par le contact |
| D-11 | `global-error.tsx` et messages d'erreur API traduits | P2 | — |

### EPIC E — Réponse du courtier et échanges avec le visiteur (BRK, API, PUB, DB) — cœur du produit

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| E-01 | Notifications visiteur à chaque étape : demande transmise (avec le nom du courtier), prise en charge (acceptation), proposition disponible, message du courtier, demande de documents, réaffectation, clôture. Nouveaux `NotificationType`, e-mail bilingue, lien magique | P0 | Seulement à la soumission |
| E-02 | **Proposition au visiteur** (Starter et Pro) : message, prime indicative ou fourchette, garanties résumées, validité, PDF facultatif (stockage S3 et antivirus), mention obligatoire « proposition indicative non contractuelle, à confirmer par le courtier ». Statut : brouillon → envoyée → vue → réponse visiteur | P0 | Métadonnées internes, pas d'interface |
| E-03 | **Messagerie** courtier ↔ visiteur liée au lead : texte et pièces jointes, notification e-mail, historique opposable, filtrage des formulations interdites côté courtier | P1 | Inexistant |
| E-04 | Réponse du visiteur à une proposition : « Intéressé, rappelez-moi », « Je ne donne pas suite » (motif facultatif) ou question. Historisée, notifiée au courtier, sans changement automatique de statut | P0 | Inexistant |
| E-05 | Demande de documents par le courtier → téléversement par le visiteur depuis son espace (réutilise le module de documents de devis) | P1 | Téléversement à la soumission seulement |
| E-06 | Correspondance des statuts CRM vers les statuts publics (§7.2). Les statuts internes (notes, injoignable, hors cible) ne sont jamais exposés | P0 | — |
| E-07 | Isolation : un courtier non assigné n'a accès à aucune proposition ni à aucun message. Le visiteur ne voit que les éléments marqués « visibles visiteur ». Tests RBAC obligatoires | P0 | — |
| E-08 | SLA mesuré du premier contact jusqu'à la première réponse visible par le visiteur ; alimente le tableau de bord SLA existant | P1 | Mesure du premier geste seulement |

### EPIC F — Compléments du portail Starter et du CRM (BRK, API)

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| F-01 | Politique de révélation des coordonnées (D-2) : masquées avant acceptation, complètes après, pour Starter comme pour Pro. Chaque révélation est auditée | P0 | Starter : tout est visible dès l'affectation. Pro : masqué même après acceptation |
| F-02 | Interface CRM pour les routes déjà câblées : assignation à un conseiller, documents (vrai téléversement), propositions (E-02), litiges, Kanban | P0 (assignation, propositions) / P1 (le reste) | Routes sans écran |
| F-03 | Starter : bouton « Répondre au visiteur » (proposition simple, E-02) sans les fonctions CRM. Demande un amendement de la constitution (D-5) | P0 | — |
| F-04 | Lien d'export CSV Starter (route existante, politique d'export respectée) | P2 | Route non consommée |

### EPIC G — Self-service du courtier (BRK, API)

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| G-01 | Profil société : lecture de tous les champs ; modification des contacts et de la présentation publique. Les champs réglementaires passent par une demande de modification validée par l'admin | P0 | Identifiants techniques seulement |
| G-02 | Licences : consultation, dépôt de renouvellement (pièce justificative), suivi de la validation | P0 | Inexistant |
| G-03 | Équipe : inviter, désactiver et réactiver des utilisateurs du courtier (Owner et Manager), affecter un rôle du catalogue courtier, MFA obligatoire. `/team` devient fonctionnel | P0 | Placeholder |
| G-04 | Consultation de la couverture (pays et produits) et demande d'extension soumise à l'admin | P1 | — |
| G-05 | Facturation : relevé mensuel pour tous les plans (Starter compris), liste et téléchargement des factures émises, solde des packs | P1 | Relevé Pro+ seulement, dans `/crm` |
| G-06 | Demande de changement de plan (traitée par l'admin, sans paiement en ligne) | P2 | Badges seulement |

### EPIC H — Exploitation dans le back-office admin (ADM, API)

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| H-01 | Demandes de devis : liste, filtres, détail (consentement, routage, affectations, documents) | P0 | Route sans écran |
| H-02 | Revue manuelle : traiter `manual_review` (router, marquer non routable ou doublon) avec persistance et audit, puis routage manuel (route existante) | P0 | La méthode ne persiste pas, aucune route |
| H-03 | Affectations de leads : liste et réaffectation | P1 | Page statique |
| H-04 | Messages de contact : liste, statut (nouveau, traité, spam), réponse par e-mail | P1 | Route sans écran ; pas de statut |
| H-05 | Journaux d'audit : recherche par acteur, cible, action et période, avec export restreint | P0 | Route sans écran |
| H-06 | Anomalies de routage et historique : écran (spec 049) | P1 | Routes sans écran |
| H-07 | Intégrations partenaires : créer et révoquer des clés d'API, des webhooks et la liste d'autorisation | P2 | Lecture seule |
| H-08 | Fournisseurs de messagerie : bouton « envoi de test » | P2 | Route non consommée |
| H-09 | Tableau de bord admin, KPI manquants du PRD §21 : visiteurs (une fois l'analytique branchée), taux visite → demande, chiffre d'affaires abonnements et leads | P2 | Partiel |

### EPIC I — Notifications et traitements asynchrones (API, OPS)

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| I-01 | Workers planifiés en continu (conteneur dédié, boucle ou cron) pour les notifications de devis, les webhooks partenaires et les enquêtes, avec métriques d'arriéré et alertes | P0 | Exécution manuelle uniquement |
| I-02 | Choisir entre consommer les files BullMQ (un vrai `Worker`) et les supprimer au profit du sondage en base. Appliquer `BULLMQ_PREFIX`. Aucune file « écrite mais jamais lue » (D-7) | P1 | Files jamais consommées |
| I-03 | Notifications courtier du PRD §23 : lead réassigné, document reçu, rappel de tâche, quota atteint, facture disponible, réponse visiteur | P1 | Partiel |
| I-04 | Notifications admin : licence bientôt expirée, offre expirée, pays sans courtier actif, pic de leads non routés, taux de litige élevé, worker en échec | P1 | Partiel (tableau de bord) |
| I-05 | Désinscription et préférences du visiteur pour les messages non transactionnels (enquête) | P1 | — |

### EPIC J — Facturation B2B au lancement (ADM, BRK, API, DB)

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| J-01 | Émission de la facture mensuelle depuis le brouillon : numérotation séquentielle par pays, PDF, mentions légales, devise XOF, TVA selon le pays (à valider par la comptabilité) | P1 | Brouillons non facturants |
| J-02 | Enregistrement manuel d'un paiement reçu (virement, mobile money hors plateforme) et état des comptes | P1 | — |
| J-03 | Attribution d'un pack de leads après paiement constaté (existant côté admin) | P1 | OK |
| J-04 | Paiement en ligne des abonnements et des packs : **hors périmètre**, spec dédiée (D-8) | — | — |

### EPIC K — Plateforme de production (OPS, API)

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| K-01 | Environnement de production distinct : hôte, base, Redis, domaines (`assurmatch.<tld>`, `pro.`, `admin.`, `api.`), certificats TLS, job de déploiement avec approbation manuelle (GitHub Environment) | P0 | Inexistant |
| K-02 | **Déploiement de l'app courtier** : Dockerfile, image GHCR, service compose, vhost nginx, contrôle de santé, DNS | P0 | Non déployée |
| K-03 | Préproduction rétablie : runner réenregistré, déploiement complet, checklist go/no-go exécutée | P0 | Runner absent |
| K-04 | Migrations automatisées (`prisma migrate deploy` avant le basculement) avec contrôle de statut, et procédure de rollback testée | P0 | Manuel |
| K-05 | Création du premier Super Admin en production : commande CLI à usage unique, auditée, MFA imposée au premier login, désactivée ensuite | P0 | Aucun chemin |
| K-06 | Configuration séparée par application : les frontaux ne reçoivent que leurs variables publiques. `.env.*.example` aligné sur le code (`ASSURMATCH_S3_*`, `ASSURMATCH_ANTIVIRUS`, `ASSURMATCH_AI_*`…) ; variables inutilisées retirées | P0 | Fichier unique partagé |
| K-07 | Stockage S3 et ClamAV déployés, obligatoires dès qu'un téléversement est activé (documents de devis, d'agrément, propositions) | P0 | Disque local, scanner factice |
| K-08 | E-mail transactionnel : fournisseur professionnel, domaine expéditeur aligné SPF/DKIM/DMARC, mode aperçu désactivé, suivi des rebonds | P0 | Gmail personnel en mode aperçu |
| K-09 | Observabilité : journaux JSON structurés (requêtes et erreurs) avec masquage des données personnelles, suivi des erreurs (Sentry ou équivalent), métriques, surveillance de disponibilité, alertes (5xx, latence, arriéré des workers, échecs d'e-mail, expiration des certificats) | P0 | Absent |
| K-10 | Endpoints publics `/healthz` (vivacité) et `/readyz` (base et Redis), sans donnée sensible | P0 | Santé réservée au super_admin |
| K-11 | Sauvegardes chiffrées hors site (base et fichiers), rétention définie, test de restauration exécuté et chronométré (objectifs RPO et RTO) | P0 | Locales, jamais restaurées |
| K-12 | Sécurité : IP client tirée du dernier saut de confiance (pas de `X-Forwarded-For` à gauche), limitation de débit par IP sur l'authentification, en-têtes de sécurité (CSP, HSTS, XFO) versionnés, configuration nginx versionnée dans le dépôt, Dependabot et scan de secrets complet | P0 | IP falsifiable, en-têtes documentés seulement |
| K-13 | Test d'intrusion externe et correction des failles critiques et élevées avant l'ouverture | P0 | — |
| K-14 | Runbooks manquants : incident et astreinte, supervision, workers (webhooks, enquêtes), reprise après sinistre, déploiement de l'app courtier ; mise à jour des documents qui ne correspondent plus au code | P1 | Partiel |

### EPIC L — Prérequis légaux et conformité (OPS, PUB, juridique)

| ID | Exigence | Prio | Responsable |
|---|---|---|---|
| L-01 | Mentions légales complètes : société, RCCM, siège, directeur de publication, hébergeur (CI) | P0 | Juridique |
| L-02 | Politique de confidentialité : responsable de traitement, DPO, autorité (ARTCI), durées de conservation validées, sous-traitants | P0 | Juridique, DPO |
| L-03 | Déclaration ou autorisation auprès de l'ARTCI (loi ivoirienne 2013-450) | P0 | DPO |
| L-04 | Contrats de sous-traitance des données (DPA) : hébergeur, e-mail, IA (si activée), stockage | P0 | Juridique |
| L-05 | Contrat de partenariat courtier : rôle technique d'AssurMatch, prix des leads, litiges, données, SLA ; acceptation tracée dans l'outil (A-10) | P0 | Juridique, commercial |
| L-06 | Textes de consentement FR et EN validés, puis publiés (B-04) | P0 | Compliance |
| L-07 | Durées de rétention par pays et par catégorie validées, et remplaçant les valeurs provisoires (spec 046) | P0 | Juridique |
| L-08 | Vérification du positionnement : pas de requalification en intermédiaire (avis juridique CIMA écrit, notamment sur la proposition non contractuelle relayée en E-02) | P0 | Juridique |
| L-09 | Bandeau cookies, uniquement si un outil d'analytique est branché | P1 | Produit |

### EPIC M — Qualité et tests de bout en bout (OPS, toutes surfaces)

| ID | Exigence | Prio | État actuel |
|---|---|---|---|
| M-01 | Suite Playwright multi-applications qui déroule SC-01 à SC-10 contre une pile `docker compose` complète en CI (base vide + seed de référence), y compris la lecture des e-mails dans Mailpit | P0 | 50 tests sur 53 ne vérifient que des marqueurs dans le source ; les tests réels sont désactivés en CI |
| M-02 | Garde-fou « atteignabilité » : chaque contrôleur de domaine doit être câblé ou explicitement marqué « interne », sinon le test d'inventaire des routes échoue | P0 | — |
| M-03 | Test de charge sur le catalogue public et la soumission de devis (objectif : 50 req/s soutenues, p95 < 800 ms) | P1 | — |
| M-04 | Tests de régression constitutionnels sur les nouveaux flux : consentement nommé, isolation des propositions, formulations interdites dans les propositions et messages | P0 | — |

---

## 6. Exigences non fonctionnelles

| Domaine | Exigence |
|---|---|
| Performance | Pages publiques : p95 < 1,5 s (rendu serveur). API publique : p95 < 800 ms. La soumission de devis ne fait aucun traitement lourd de façon synchrone (constitution III). |
| Disponibilité | 99,5 % mensuel au lancement. RPO ≤ 24 h, RTO ≤ 4 h. |
| Sécurité | MFA obligatoire pour les admins et les courtiers. Sessions httpOnly, secure, SameSite. Jetons visiteur hachés, durée de vie limitée, retirés des journaux. OWASP ASVS niveau 2 visé. |
| Données | PII chiffrées au repos (disque et sauvegardes). Masquage dans les journaux. Une proposition ou un message reste visible par le visiteur seulement pendant la durée de rétention. |
| Accessibilité | WCAG 2.1 AA sur le parcours public et les écrans courtier principaux. |
| Langues | FR et EN pour le site public, les e-mails visiteur et les formulaires. Back-office en FR. |
| Mobile | Parcours public et espace de suivi entièrement utilisables sur mobile (cible principale). |
| Audit | Chaque nouvelle action de la section 5 qui modifie un état produit un AuditLog (acteur, cible, contexte, résultat, correlationId). |

---

## 7. Modèle de données et statuts

### 7.1 Nouvelles entités ou extensions (indicatif, à préciser en `data-model.md`)

- `PartnerTenant` : statuts PRD, contacts, assureurs partenaires, `contractAcceptedAt`, `contractVersion`.
- `PartnerApplication` : `status`, `decidedBy`, `decisionReason`, `convertedPartnerTenantId`.
- `PartnerLicense` : statuts `suspended` et `revoked`, documents liés, historique.
- `AccreditationDocument` : persisté (aujourd'hui en mémoire).
- `RegulatoryRegime` : persisté.
- `Offer` : `status` (brouillon, en validation, publiée, suspendue, expirée), `version`, `submittedBy`, `createdByRole` (admin ou courtier).
- `QuoteRequest` : `locale`, `selectedOfferPartnerId` (dénormalisé), `publicStatus`.
- `VisitorAccessToken` : haché, expiration, révocation, usage.
- `LeadProposal` (évolution de `BrokerCrmProposal`) : `visibleToVisitor`, `status`, `documentId`, `validUntil`, `sentAt`, `viewedAt`.
- `LeadMessage` : auteur (visiteur ou courtier), corps, pièces jointes, `readAt`.
- `VisitorResponse` : type (intéressé, refus, question), motif.
- `Invoice` : numéro, PDF, statut (émise, payée, annulée), et `Payment` enregistré manuellement.
- `NotificationType` : `quote_transmitted`, `lead_accepted_visitor`, `proposal_available`, `broker_message`, `documents_requested`, `quote_closed`, `visitor_response`, `license_expiring`, `offer_expiring`, `invoice_issued`.

### 7.2 Statuts publics de la demande (vus par le visiteur)

| Statut public | Statuts internes correspondants |
|---|---|
| Reçue | soumise, en anti-spam |
| En vérification | `manual_review`, doublon en cours d'examen |
| Transmise à {Courtier} | routée, assignée, non encore acceptée |
| Prise en charge par {Courtier} | acceptée, contact tenté, contactée, qualifiée, documents demandés, devis en préparation |
| Proposition disponible | devis envoyé, négociation |
| Clôturée | gagnée, perdue, rejetée, non routable, retrait du consentement |
| Non transmise | non routable (avec explication non sensible, constitution VIII) |

Les statuts internes « injoignable », « hors cible », « doublon » et « contesté » ne sont **jamais** affichés tels quels au visiteur.

---

## 8. Contraintes constitutionnelles applicables

| Principe | Application dans ce PRD |
|---|---|
| I. Positionnement | E-02 et E-03 : propositions marquées « indicatives, non contractuelles, à confirmer par le courtier ». Aucune souscription : la conclusion se fait chez le courtier. Avis juridique L-08 requis. |
| II. Consentement et licences | D-01 consentement nommé. A-03 et A-10 licence validée avant activation. A-12 désactivation rapide. Audit de toutes les actions des EPIC A, B, C, E. |
| III. Séparation des applications | L'espace de suivi visiteur vit dans l'app publique, avec un jeton visiteur distinct de toute session back-office. L'app courtier reste séparée (K-02, domaine propre). |
| IV. Sécurité | E-07 isolation. F-01 révélation des coordonnées auditée. K-12 et K-13 sécurité. MFA pour les invités (G-03). |
| V. IA | Aucune activation dans ce PRD. Les nouvelles surfaces n'appellent pas l'IA. |
| VI. Historique | Versionnage des offres (C-04), historique des propositions, messages et réponses (E-02 à E-04), décisions sur les candidatures (A-08). |
| VII. Routage | C-06 : la préférence d'offre ne contourne jamais l'éligibilité ; le refus est journalisé. |
| VIII. UX | Courtier nommé, statuts publics compréhensibles, formulations interdites filtrées dans le contenu saisi par les courtiers. |
| XI. Gouvernance | F-03 (Starter qui répond) demande un **amendement constitutionnel** (critère d'acceptation n°1). Chaque épique passe par `/speckit.specify`. |

---

## 9. Décisions produit à trancher

| ID | Question | Recommandation |
|---|---|---|
| D-1 | Périmètre du lancement | CI, Auto et Voyage, 3 à 5 courtiers, IA fermée, multi-courtiers fermé. |
| D-2 | À quel moment le courtier voit-il les coordonnées complètes du visiteur ? | Après acceptation, pour tous les plans. Avant : produit, ville, besoin, coordonnées masquées. Protège le visiteur et rend l'acceptation significative pour la facturation. |
| D-3 | Le visiteur a-t-il un compte ? | Non : espace de suivi par **lien magique** (e-mail), sans mot de passe. Reste conforme au parcours anonyme du PRD v0.2 et évite une gestion de comptes grand public. |
| D-4 | Une offre choisie oriente-t-elle le routage ? | Oui, en priorité si le courtier de l'offre est éligible (licence, couverture, quota). Sinon, routage standard, avec le motif affiché au visiteur avant consentement si connu, sinon après. |
| D-5 | Le courtier Starter peut-il répondre au visiteur sur la plateforme ? | Oui, avec une proposition simple (message et PDF) sans CRM. Demande un amendement MINOR de la constitution (critère n°1). Sinon, la boucle SC-06 ne marche que pour Pro. |
| D-6 | Que reçoit un courtier « Actif test » ? | Uniquement des leads de test (demandes marquées test, depuis un pays en statut interne). Jamais de lead réel. |
| D-7 | BullMQ ou sondage en base ? | Garder le sondage en base (déjà idempotent et testé) dans un conteneur worker unique. Retirer les files BullMQ non consommées, ou les réserver à une spec ultérieure. |
| D-8 | Paiement des abonnements et des packs | Facturation manuelle au lancement (J-01, J-02). Spec « paiements B2B » (mobile money, carte) après 3 mois d'exploitation. |
| D-9 | Messagerie courtier ↔ visiteur au lancement ? | P1 : la proposition et la réponse visiteur (E-02, E-04) suffisent pour SC-06 et SC-07. La messagerie libre vient juste après, avec modération des formulations. |
| D-10 | Nom de domaine et marque de production | À fournir (aujourd'hui sous `allianceconsultants.net`). |

---

## 10. Découpage en specs Spec Kit (ordre recommandé)

Chaque spec démarre par `/speckit.specify`, cite ses surfaces et ses principes, et contient des critères Given/When/Then repris des scénarios de la section 4.

| # | Spec | Épiques | Surfaces | Dépend de | Débloque |
|---|---|---|---|---|---|
| 050 | `050-admin-catalog-consent-activation` : pays, produits, liaisons pays-produit, régimes, textes de consentement, flags pays et produit, seed de référence complété | B-01…B-05, B-08, B-09 | ADM, API, DB, SHR | — | SC-01 |
| 051 | `051-admin-partner-onboarding` : PartnerTenant, statuts, licences, documents d'agrément, couverture, plan et quota, candidatures → courtier, invitation du propriétaire, suspension | A-01…A-10, A-12 | ADM, API, DB, SHR | 050 | SC-02 |
| 052 | `052-offers-admin-ui-broker-self-service` : interface admin des offres, offres gérées par le courtier, validation, versionnage, routage selon l'offre choisie | C-01…C-06 | ADM, BRK, API, PUB, DB | 051 | SC-04 |
| 053 | `053-broker-self-service-team` : profil, licences, équipe et invitations, couverture | G-01…G-04 | BRK, API | 051 | SC-03 |
| 054 | `054-visitor-tracking-space-notifications` : lien magique, statuts publics, suivi dynamique, courtier nommé, consentement nommé, e-mails bilingues, liens corrigés, page `/avis` | D-01…D-09, E-01, E-06 | PUB, API, DB | 050 | SC-05 |
| 055 | `055-broker-response-loop` : révélation des coordonnées, propositions au visiteur (Starter et Pro), réponse du visiteur, interface CRM d'assignation et de documents, isolation. **Précédée de l'amendement constitutionnel D-5** | E-02, E-04, E-05, E-07, F-01…F-03 | BRK, PUB, API, DB | 054 | SC-06, SC-07 |
| 056 | `056-admin-operations-consoles` : demandes de devis et revue manuelle persistée, journaux d'audit, affectations, messages de contact, anomalies | H-01…H-06 | ADM, API | 050 | SC-09 |
| 057 | `057-production-platform` : environnement de production, déploiement de l'app courtier, workers planifiés, migrations, premier Super Admin, configuration par app, S3, ClamAV, e-mail, `/healthz` | K-01…K-08, K-10, I-01, I-02 | OPS, API | — (en parallèle) | SC-10 |
| 058 | `058-observability-security-hardening` : journaux, suivi des erreurs, alertes, sauvegardes hors site, IP de confiance, en-têtes, nginx versionné, Dependabot | K-09, K-11, K-12, K-14 | OPS, API | 057 | SC-10 |
| 059 | `059-e2e-journey-ci` : suite Playwright SC-01 à SC-10 sur pile Docker, garde-fou d'atteignabilité, test de charge | M-01…M-04 | toutes | 050 à 056 (incrémental) | Go-live |
| 060 | `060-b2b-manual-invoicing` : factures PDF numérotées, paiements manuels, facturation visible pour Starter | J-01…J-03, G-05 | ADM, BRK, API, DB | 051 | SC-08 |
| 061 | `061-notifications-completion` : notifications courtier et admin du PRD §23, préférences visiteur | I-03…I-05, A-11, C-05 | API, BRK, ADM | 054 | — |
| 062 | `062-broker-visitor-messaging` (P1 post-lancement possible) | E-03, E-08 | BRK, PUB, API, DB | 055 | — |

**Parcours critique :** 050 → 051 → 052 et 054 → 055 → 059. La piste OPS (057 → 058) avance en parallèle dès maintenant.

**Hors code, en parallèle :** EPIC L (juridique et conformité), réenregistrement du runner de préproduction (K-03), choix du domaine (D-10), fournisseur d'e-mail (K-08), test d'intrusion (K-13) une fois 055 livrée.

---

## 11. Jalons de mise en production

| Jalon | Contenu | Critère de sortie |
|---|---|---|
| J1 — Fondations | 050, 051, 057 ; préproduction rétablie | SC-01 et SC-02 passent en préproduction |
| J2 — Boucle complète | 052, 053, 054, 055 | SC-03 à SC-07 passent en préproduction |
| J3 — Exploitabilité | 056, 058, 060, 059 | SC-08 à SC-10 passent ; suite E2E verte en CI |
| J4 — Pilote fermé | Production avec 3 à 5 courtiers signés, pays en statut interne, trafic limité (lien direct) | 2 semaines sans incident critique, SLA mesuré, 0 écart de conformité |
| J5 — Ouverture publique | `country_public_enabled` CI activé par la Compliance, communication | Checklist go/no-go 100 %, EPIC L entièrement signée, test d'intrusion clos |

---

## 12. Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Requalification en intermédiaire du fait du relais de propositions | Réglementaire, bloquant | Avis juridique L-08 avant 055. Mentions non contractuelles obligatoires. La proposition émane toujours du courtier nommé. Aucune comparaison de propositions par AssurMatch. |
| Fuite de données visiteur entre courtiers | Critique | Tests RBAC E-07 et F-01. Révélation auditée. Revue de sécurité de 055. Test d'intrusion. |
| Lien magique intercepté ou partagé | Moyen | Jeton court, révocable, renvoyé uniquement à l'e-mail d'origine. Aucune donnée sensible dans l'URL au-delà du jeton. `noindex`. |
| Écart entre la carte de couverture et la réalité | Élevé (déjà constaté) | Garde-fou M-02. Critère « atteignable par l'utilisateur cible » dans chaque spec. |
| Délais juridiques (ARTCI, contrats) | Retarde J5 | Lancer EPIC L dès la validation de ce PRD. Pilote J4 en statut interne. |
| Courtiers peu réactifs | Expérience visiteur dégradée | SLA visible (E-08). Relances automatiques (I-03). Réaffectation manuelle (H-03). |
| Arrêt silencieux des e-mails | Le visiteur ne reçoit rien | Worker supervisé (I-01). Alerte sur l'arriéré et les rebonds (K-09). |

---

## 13. Annexe — Traçabilité entre écarts constatés et exigences

| Écart constaté (audit du 2026-10-02) | Exigences |
|---|---|
| `AdminPartnersController`, `PartnerLicensesController` non câblés | A-01, A-03, A-05, A-06 |
| Candidatures sans écran ni décision | A-08 |
| Pays, produits, régimes et consentements non câblés ; page catalogue statique | B-01 à B-04 |
| Formulaires et consentements uniquement dans le seed démo | B-04, B-05, B-09 |
| Page admin `/offers` statique ; pas d'offres côté courtier | C-01, C-02, C-03 |
| `selectedOfferId` ignoré par le routage | C-06 |
| « courtier partenaire » codé en dur | D-01, D-02, D-04 |
| Lien de suivi de l'e-mail sans jeton | D-03, D-05 |
| Page de suivi statique | D-04 |
| E-mails FR uniquement, mauvais libellé pour `manual_review` | D-06, D-07 |
| `/avis/{ref}` en 404 | D-08 |
| Proposition interne, aucune notification au visiteur | E-01, E-02, E-04 |
| Coordonnées masquées dans le CRM Pro, visibles dès l'affectation en Starter | F-01 |
| Assignation, documents, propositions, Kanban sans écran | F-02 |
| `/team` placeholder ; profil en identifiants techniques | G-01, G-03 |
| Demandes de devis, audit, contact, flags sans écran ; revue non persistée | H-01, H-02, H-04, H-05, B-08 |
| Workers non planifiés ; BullMQ jamais consommé | I-01, I-02 |
| Pas de production ; app courtier non déployée ; runner absent | K-01, K-02, K-03 |
| Pas de premier Super Admin en production | K-05 |
| Gmail personnel ; S3 et ClamAV non déployés | K-07, K-08 |
| Pas de supervision ; santé réservée au super_admin ; sauvegardes locales | K-09, K-10, K-11 |
| IP `X-Forwarded-For` falsifiable ; en-têtes documentés seulement | K-12 |
| Textes légaux à compléter ; ARTCI ; DPA ; rétention provisoire | L-01 à L-07 |
| Tests E2E réduits à des marqueurs dans le source | M-01, M-02 |
