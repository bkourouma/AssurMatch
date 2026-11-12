# Scénario de test complet — parcours courtier de bout en bout, avec cas limites

Version du 2026-11-12. Remplace et étend `docs/scenarios/e2e-admin-courtier-devis.md` (qui reste le squelette « chemin nominal » en 31 étapes) : ce document garde les mêmes phases et ajoute, pour chaque étape, les cas limites avec un résultat attendu précis. Tous les libellés, routes et règles ci-dessous ont été relevés dans le code (apps/admin, apps/broker, apps/public, backend/, packages/shared) le 2026-11-12. Les rares points déduits du code sans avoir été rejoués sont marqués **[À CONFIRMER]**.

Surfaces concernées : Web Publique Client (visiteur et candidat courtier), Back-office Plateforme/Admin, Broker Back-office, Backend API, e-mails (Mailpit). Les parcours visiteur (public) et les parcours authentifiés (admin, courtier) restent séparés : trois applications, trois cookies distincts.

## 1. Comment lire ce document

### 1.1 Identifiants

- `P<phase>-<nn>` : cas nominal (chemin attendu). Exemple : `P1-03`.
- `E-P<phase>-<nn><lettre>` : cas limite rattaché au cas nominal du même numéro. Exemple : `E-P1-03a`.
- `T-nn` : cas transversaux (sécurité, accès croisés, injection, limites de débit, e-mails).
- `A11Y-nn`, `RSP-nn`, `I18N-nn` : accessibilité clavier, responsive 375 px, langues FR/EN.

### 1.2 Colonnes

| Colonne | Sens |
|---|---|
| Acteur | Qui agit : SA (Super Admin), CA (Compliance Admin), FA (Finance Admin), AP (Admin Pays), SU (Support Admin), CAND (candidat courtier), PROP (propriétaire du courtier A), AGT (agent du courtier A), LEC (lecteur du courtier A), PROP-B (propriétaire du courtier B), V1 / V2 (visiteurs), SYS (système : e-mail, worker, API directe) |
| App | Admin (3602), Broker (3603), Public (3601), API (3600), Mailpit (8025) |
| Couv. | `C` : déjà couvert par une spec Playwright (fichier et identifiant indiqués, **ne pas réécrire**). `P` : couvert en partie (ce qui reste à faire est dit). `N` : nouveau, aucun test existant. |

Le détail de la couverture par fichier figure à la section 15.

### 1.3 Exécution

- **Automatisé existant** (pile Docker vierge, ports 48600-48603, Mailpit 48825) : `npm run test:e2e:stack`. Ce document ne le modifie pas et ne l'utilise pas.
- **Manuel ou semi-automatisé** : pile locale (`cmd /c launch-local.bat`, ports 3600-3603, Mailpit 8025) démarrée **sans** `ASSURMATCH_LOCAL_DEMO_SEED` (le seed démo crée des courtiers déjà actifs et fausserait le test).
- Les cas marqués `N` sont destinés à de futures specs `tests/e2e/*.spec.ts` ; la colonne « Résultat attendu » sert alors d'assertion.

## 2. Pré-requis

| # | Pré-requis | Vérification |
|---|---|---|
| R1 | Pile vierge démarrée, `npm run local:health` vert | 9 contrôles verts |
| R2 | Variables `LOCAL_BOOTSTRAP_ADMIN_EMAIL` et `LOCAL_BOOTSTRAP_ADMIN_PASSWORD` (12 caractères ou plus) fournies au lanceur | Le Super Admin peut se connecter |
| R3 | Worker de notifications actif (file d'e-mails traitée toutes les 10 s) | Un e-mail d'activation arrive dans Mailpit en moins d'une minute |
| R4 | Application d'authentification TOTP (ou le helper `tests/e2e/support/totp.ts`) | Codes à 6 chiffres, période 30 s, tolérance environ 30 s |
| R5 | Jeton d'activation valable 30 minutes par défaut (`AUTH_ACTION_TOKEN_TTL_MINUTES`) : ne pas laisser plus de 30 min entre l'invitation et l'ouverture du lien, sauf pour les cas « jeton expiré » | |
| R6 | Délai de l'enquête de satisfaction ramené à 0 (`ASSURMATCH_SATISFACTION_SURVEY_DELAY_MINUTES=0`) pour la phase 7 (24 h par défaut) | L'e-mail « Votre avis… » part après la clôture |
| R7 | Flags sensibles (`satisfaction_survey_enabled`, `billing_enabled`, `multi_broker_routing_enabled`) ouverts uniquement par la politique auditée `scripts/ops/apply-flag-policy.ts` : aucun bouton dans l'interface | `PATCH` direct refusé (403, `CATALOG_FLAG_NOT_TOGGLEABLE` ou `ACTIVATION_VIA_OPS_ONLY`) |
| R8 | Fichiers de test (section 4) préparés | |
| R9 | Pour les cas de durée (session 15 min, proposition expirée, lien expiré 30 jours) : pile jetable uniquement, voir hypothèses H11 et H12 | |

Conditions d'ouverture d'un pays que l'ancien scénario ne mentionnait pas (relevées dans `backend/src/modules/activation-checklist/activation-checklist.service.ts`) : au moins une règle de routage active pour le pays ; 4 attestations pays ; par produit : documents requis définis, règle de scoring active, avertissement légal FR et EN, 4 attestations produit ; et **au moins un courtier actif public, autorisé, licencié, avec agrément accepté**. Le helper `tests/e2e/support/activation-prerequisites.ts` les pose.

## 3. Comptes et acteurs

Remplacer `<sfx>` par un suffixe unique par exécution (4 à 6 caractères alphanumériques minuscules, par exemple `k7f2a`).

| Clé | Application | E-mail (jetable) | Rôle |
|---|---|---|---|
| SA | Admin | valeur de `LOCAL_BOOTSTRAP_ADMIN_EMAIL` | `super_admin` |
| CA | Admin | `compliance.<sfx>@e2e.assurmatch.test` | `compliance_admin` |
| FA | Admin | `finance.<sfx>@e2e.assurmatch.test` | `finance_admin` |
| AP | Admin | `adminpays.<sfx>@e2e.assurmatch.test` | `admin_pays` (périmètre CI) |
| SU | Admin | `support.<sfx>@e2e.assurmatch.test` | `support_admin` |
| CAND | Public | `candidat.<sfx>@e2e-courtage.test` | candidat (pas de compte) |
| PROP | Broker | `owner.<sfx>@e2e-courtage.test` | `broker_owner_starter` |
| AGT | Broker | `agent.<sfx>@e2e-courtage.test` | `broker_agent` |
| LEC | Broker | `lecteur.<sfx>@e2e-courtage.test` | `broker_read_only` |
| PROP-B | Broker | `owner.b.<sfx>@e2e-courtage.test` | `broker_owner_starter` (courtier B, isolation) |
| V1 | Public | `visiteur1.<sfx>@e2e-visiteur.test` | visiteur sans compte (lien magique, H1) |
| V2 | Public | `visiteur2.<sfx>@e2e-visiteur.test` | second visiteur (accès croisés) |
| V3 | Public | `visiteur3.<sfx>@e2e-visiteur.test` | visiteur « aucun courtier disponible » |

Tous les mots de passe de test ont 12 caractères ou plus et ne figurent pas dans la liste noire (`password`, `password123`, `assurmatch123`, `admin123456`, etc.). Les noter dans le fichier de seed du test, jamais dans un rapport.

## 4. Jeu de données

| Donnée | Valeur |
|---|---|
| Raison sociale du courtier A | `E2E Courtage <sfx>` |
| Nom commercial | `E2E Courtage <sfx> Assurances` |
| Courtier B (isolation) | `E2E Courtage <sfx> B` (créé par l'admin sans candidature) |
| Licence A | `CI-AGR-<sfx>` (expiration : aujourd'hui + 365 jours) ; autorité « Autorité de contrôle E2E » |
| Licence B | `CI-AGR-<sfx>-B` |
| Pays, produits | Côte d'Ivoire (CI), Assurance auto (`auto`) et Assurance voyage (`voyage`). Voyage reste sans courtier autorisé (cas « aucun courtier disponible ») |
| Plan | Starter (CRM : voir les cas Pro dans `tests/e2e/pro-*.spec.ts`) |
| Offre principale | `Auto Confort <sfx>` : assureur du pays, niveau 3, garanties « Responsabilité civile », « Défense et recours », « Vol et incendie », franchise 50000, prime min 80000, prime max 140000, XOF, unité « an », fractionnement « Annuel », validité du jour à +365 jours, source « Grille tarifaire E2E », mentions « offre indicative » et « prix à confirmer par le courtier partenaire » |
| Offre refusée | `Auto Eco <sfx>` (sera refusée) |
| Offre suspendue | `Auto Premium <sfx>` (sera suspendue puis réintégrée) |
| Téléphones | valide CI : `+2250102030405` (E.164) ; en saisie visiteur CI, 10 chiffres `0102030405` ou `+225` suivi de 10 chiffres ; invalides : `0102030405` (candidature : pas de « + »), `+225 01 02` (espaces, trop court), `+12345` |
| Fichiers | `licence.pdf` (PDF valide, moins de 5 Mo) ; `gros.pdf` (5 Mo plus 1 octet, en-tête `%PDF`) ; `note.txt` (texte) ; `faux.pdf` (texte renommé en `.pdf`, octets sans `%PDF`) ; `eicar.pdf` (en-tête `%PDF` suivi de la chaîne de test EICAR dans les 4096 premiers octets ; `tests/e2e/support/files.ts` fournit `pdfFile` et `eicarFile`) ; `photo.png` (PNG valide) ; `vide.pdf` (0 octet) ; `programme.exe` (commence par `MZ`) |
| Chaînes d'injection | XSS : `<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>` ; SQL : `'; DROP TABLE leads;--`, `' OR '1'='1` ; gabarit : `{{7*7}}` ; tableur : `=HYPERLINK("http://x.test","a")` |
| Motif d'audit | `Motif E2E <sfx> valide` (8 caractères ou plus, partout) |

## 5. Phase 0 — Plateforme : connexion, flags, consentements, formulaires, pays

Acteurs : SA, puis CA. App : Admin. Routes : `/login`, `/mfa`, `/feature-flags`, `/consent-texts`, `/quote-form-definitions`, `/catalog/countries`, `/catalog/products`, `/activation-checklist`, `/users`.

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| P0-01 | SA | Admin | `/login` : e-mail et mot de passe du bootstrap, « Se connecter » ; `/mfa` : « Générer secret et codes de secours », saisir le code TOTP, « Vérifier MFA » | Secret TOTP affiché une seule fois (avec URI `otpauth://` et 8 codes de secours de 10 caractères) ; tableau de bord admin visible | C : scenario-core SC-01a |
| E-P0-01a | SA | Admin | Mauvais mot de passe | Pas de session ; redirection `/login?error=validation_error` avec « Vérifiez le format de l'email et du mot de passe. » ; le message ne dit pas si l'e-mail existe **[À CONFIRMER : statut 400 déduit du mot « invalid »]** | N |
| E-P0-01b | SA | Admin | Mot de passe de 11 caractères | Bloqué par le champ (`minLength=12`) ; via l'API, 400 | N |
| E-P0-01c | SYS | API | 11 échecs de connexion avec un e-mail inexistant (même IP) | Au-delà de 10 échecs par identifiant : 429 « Too many attempts. Please try again later. » (code `RATE_LIMITED`), identique pour un compte existant ou non **[À CONFIRMER : rang exact du premier refus]** | N |
| E-P0-01d | SA | Admin | `/mfa` : mauvais code (`000000`) | Accès refusé, on reste sur `/mfa`, aucune session MFA ; l'écran affiche le texte brut `api_400` **[À CONFIRMER]** ; le compteur d'échecs est partagé avec le mot de passe | N |
| E-P0-01e | SA | Admin | Rejouer un code TOTP déjà accepté dans la même fenêtre de 30 s | Attendu prudent (H4) : refus. **Le code ne mémorise pas le dernier compteur : le rejeu est accepté**. Consigner comme constat de sécurité, ne pas masquer | N |
| E-P0-01f | SA | Admin | `/mfa` : type « Code de secours » avec un code valide, puis le même code une seconde fois | Premier usage accepté ; second usage refusé (code consommé) | N |
| E-P0-01g | SA | Admin | Session de 15 minutes : attendre 15 min (ou supprimer le cookie `assurmatch_admin_token`) puis ouvrir `/feature-flags` | Redirection `/login?reason=session_required&returnTo=/feature-flags` avec « Connectez-vous pour accéder à l'administration. ». Si le jeton est expiré mais le cookie présent : `reason=session_expired` avec « Votre session a expiré. Connectez-vous à nouveau. ». Après reconnexion et MFA, retour sur la page demandée. Une action de formulaire en 401 affiche « Session expirée : reconnectez-vous puis recommencez. » | N |
| E-P0-01h | SA | Admin | Se connecter avec un compte `broker_*` sur l'app admin | Accès refusé : redirection `/login?error=access_denied` | N |
| P0-02 | SA | Admin | `/feature-flags` : « Activer » `public_comparator_enabled` et `quote_request_enabled` avec un motif | Succès « public_comparator_enabled activé. » (et le second) ; action auditée. `starter_portal_enabled`, `broker_crm_enabled`, `broker_dashboard_enabled` déjà actifs | C : scenario-core SC-01b |
| E-P0-02a | SA | Admin | Motif de 7 caractères | Bloqué par le champ (`minLength=8`) ; via l'API : refus « Reason is required » | N |
| E-P0-02b | SA | Admin | Chercher un bouton pour `billing_enabled`, `satisfaction_survey_enabled`, `ai_*` ; `PATCH` direct de la valeur `true` | Aucun bouton ; l'écran dit que l'interface ne crée aucun bouton d'activation pour les modules réglementés ; l'API refuse (403 « Flag sensible : procédure de conformité. Non modifiable depuis le catalogue. » ou `ACTIVATION_VIA_OPS_ONLY`) | P : admin-ai-integrations AI-01, admin-channels CH-03 (flags IA et canaux) ; reste billing, avis, multi-courtiers |
| E-P0-02c | CA | Admin | Un `compliance_admin` tente d'activer un flag global | Refus : « Action refusée : droits insuffisants ou hors périmètre. » (le rôle n'a pas `feature_flags`) | N |
| P0-03 | SA, CA | Admin | `/consent-texts` : créer le brouillon `lead_transmission` CI en FR et EN avec `{{brokerName}}` et « AssurMatch », puis « Publier » (CA) | Consentement « publié » en FR et EN | C : scenario-core SC-01b |
| E-P0-03a | CA | Admin | Publier un texte sans `{{brokerName}}` ou sans le rappel du rôle technique d'AssurMatch (ni courtier ni assureur) | « Publication refusée : le texte ne respecte pas les règles de consentement listées ci-dessous. » avec « Le destinataire {{brokerName}} est absent du texte de transmission. » ou « Le rappel du rôle technique d'AssurMatch (ni courtier ni assureur) est absent. » | N |
| E-P0-03b | CA | Admin | Texte contenant « contrat validé » ou « garantie acceptée » | Refus : « Formulation réglementée interdite détectée dans le texte. » ; texte vide : « Contenu du texte absent : saisissez le texte complet avant publication. » | N |
| E-P0-03c | AP | Admin | Un `admin_pays` tente de publier un consentement | Refus 403 (publication réservée à la conformité) | N |
| P0-04 | SA, CA | Admin | `/quote-form-definitions` : brouillon puis « Publier » un formulaire par produit (Auto, Voyage) et par langue ; `/catalog/products` : flags produit | Formulaires publiés (Auto : « Usage du véhicule » obligatoire, « Marque du véhicule » facultative ; Voyage : « Destination » obligatoire) ; six champs génériques ajoutés (« Ville », « Moyen de contact préféré » obligatoires) | C : scenario-core SC-01b |
| E-P0-04a | CA | Admin | Libellé de champ contenant « acheter maintenant » | Publication refusée (formulation réglementée) | N |
| P0-05 | CA | Admin | `/activation-checklist` : « Attester » les 4 attestations pays et 4 attestations produit (note de 10 caractères ; 30 pour « Plan de désactivation rapide documente ») ; règle de routage, règle de scoring, documents requis, avertissement légal FR et EN | La checklist du pays ne liste plus que le courtier actif public et l'offre | C : activation-prerequisites.ts via scenario-core SC-01b, senegal-opening SN-04 |
| E-P0-05a | CA | Admin | Attester avec une note trop courte | Refus (note de 10 caractères au moins, 30 pour le plan de désactivation) | N |
| E-P0-05b | AP | Admin | Attester avec un rôle autre que conformité ou Super Admin | Refus 403 (MFA et rôle conformité requis) | N |
| P0-06 | SA | Admin | Pays CI : « Changer le statut » `internal` puis `pilot` ; flags pays (comparaison, devis, inscription courtier) | « Statut du pays passé à « pilot ». » ; le pays est proposé dans la candidature courtier | C : scenario-core SC-01b |
| E-P0-06a | SA | Admin | Passer directement `internal` en `public` | Refus 409 (« Country status transition internal -> public is not allowed ») ; l'écran affiche « Conflit : cet élément existe déjà ou son état actuel ne permet pas cette action. Rechargez la page pour voir l'état à jour. » | N |
| E-P0-06b | CA | Admin | Passer CI en `public` alors que la checklist a des contrôles bloquants | « Activation refusée : la checklist d'activation a des contrôles bloquants. Corrigez-les puis recommencez. » avec la liste ; le pays reste `pilot` | C : senegal-opening SN-05 |
| E-P0-06c | AP | Admin | `admin_pays` passe CI en `public` | Refus 403 (`public` réservé à la conformité et au Super Admin) | N |
| E-P0-06d | SA | Admin | Activer `country_quote_enabled` sans formulaire publié ; activer `product_public_enabled` sans consentement `lead_transmission` publié | « Activation refusée : aucun formulaire de devis publié pour ce pays et ce produit. » ; « Activation refusée : aucun texte de consentement de transmission publié pour ce pays. » | P : senegal-opening SN-04, SN-05 (états de checklist), pas les refus de bascule |
| P0-07 | SA | Admin | `/users` : « Créer un utilisateur » (CA, FA, AP, SU), « Créer et émettre activation » ; chaque compte active son accès (lien Mailpit, mot de passe, MFA) | « Utilisateur … créé. » ; e-mail « Activation de votre accès AssurMatch » ; compte actif après MFA | C : scenario-core SC-04b (CA), admin-lot11.ts (autres rôles) |
| E-P0-07a | SA | Admin | Créer un utilisateur avec un e-mail déjà utilisé | « Conflit : cet élément existe déjà ou son état actuel ne permet pas cette action. Rechargez la page pour voir l'état à jour. » (409 « User email already exists ») | N |
| E-P0-07b | SA | Admin | Rôle courtier sans courtier de rattachement ; rôle admin avec courtier | « Un rôle courtier exige de choisir le courtier de rattachement. » ; « Un rôle admin ne peut pas être rattaché à un courtier : retirez le courtier ou choisissez un rôle courtier. » | N |
| E-P0-07c | CA | Admin | Un `compliance_admin` tente de créer un utilisateur | Refus 403 (« Action refusée : droits insuffisants ou hors périmètre. ») : seuls Super Admin et `admin_pays` (dans ses pays) créent | N |
| E-P0-07d | SA | Admin | `/users/[userId]` : suspendre avec un motif de 5 à 7 caractères | Le champ accepte (`minLength=5`) mais l'API refuse (motif de 8 caractères) : « Données invalides : vérifiez les champs saisis (le motif doit contenir au moins 8 caractères). » Incohérence interface/API à consigner | N |
| E-P0-07e | SU | Admin | Le support ouvre `/partners`, `/feature-flags` (écriture), `/billing` | Le menu n'est pas filtré par rôle, mais l'API refuse : lecture « Accès refusé : droits insuffisants ou hors périmètre. », écriture « Action refusée : droits insuffisants ou hors périmètre. » ; code 403 | N |

## 6. Phase 1 — Ajout du courtier : candidature, conversion, conformité, invitation, activation

Acteurs : CAND (Public), CA et SA (Admin). Routes publiques FR : `/courtiers/candidature`, `/courtiers/candidature/confirmation` (EN : `/en/brokers/apply`, `/en/brokers/apply/confirmation`). Routes admin : `/partners/applications`, `/partners/applications/[applicationId]`, `/partners/[partnerId]`.

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| P1-01 | CAND | Public | Assistant en 4 étapes : « Société » (Raison sociale, Pays), « Contact » (Nom du contact, E-mail du contact, Téléphone du contact), « Agrément » (Numéro d'agrément, Date d'expiration, Produits souhaités, Capacité mensuelle), « Formule et consentement » (Starter, consentement) ; « Envoyer ma candidature » | Page « Candidature reçue » avec la référence `PA-AAAA-xxxxxxxx` (8 caractères minuscules) ; e-mail « Votre candidature partenaire AssurMatch PA-… » | C : scenario-core SC-02a |
| E-P1-01a | CAND | Public | « Continuer » avec les champs d'une étape vides | Chaque champ : « Ce champ est obligatoire. » ; bandeau « Le formulaire contient des erreurs. Corrigez les champs signalés. » ; l'étape n'avance pas ; erreurs en `role="alert"` | N |
| E-P1-01b | CAND | Public | E-mail `nom@domaine` (sans point) ou `nom domaine.com` | « Adresse e-mail invalide. » | N |
| E-P1-01c | CAND | Public | Téléphone `0102030405` (sans +), `+225 01 02 03 04 05` (espaces), `+12345` (trop court) ; WhatsApp invalide alors que facultatif | « Numéro de téléphone invalide. Utilisez le format international, par exemple +225XXXXXXXXX. » ; WhatsApp vide accepté, rempli validé | N |
| E-P1-01d | CAND | Public | Date d'expiration d'agrément = aujourd'hui, hier | « La date d'expiration doit être postérieure à aujourd'hui. » | N |
| E-P1-01e | CAND | Public | Aucun produit coché ; consentement non coché | « Sélectionnez au moins un produit. » ; « Le consentement est obligatoire pour envoyer la candidature. » ; aucun envoi | N |
| E-P1-01f | SYS | API | `POST /partners/applications` avec raison sociale de 1 caractère, licence de 2 caractères, capacité 0, 10001 ou 1,5, message de 2001 caractères | 400 pour chacun (contrat serveur : société 2 à 160, licence 3 à 64, capacité entière de 1 à 10 000, message 2000 au plus). Le client n'impose pas les minimums : message affiché générique **[À CONFIRMER]** | N |
| E-P1-01g | CAND | Public | Soumettre deux fois la même candidature (même pays, même e-mail, même licence) | Pas d'erreur : confirmation avec **la même référence PA-**, un seul enregistrement dans `/partners/applications`, e-mail de confirmation renvoyé, audit `partner_application.duplicate_ignored` | N |
| E-P1-01h | CAND | Public | Même numéro de licence avec un autre e-mail ; même e-mail avec une autre licence | Deux candidatures distinctes (aucun contrôle de doublon dans ces cas, H5) ; la conformité les repère à l'examen | N |
| E-P1-01i | SYS | API | Champ honeypot `website` rempli | 400 « Invalid submission: spam_blocked » ; aucune candidature créée | N |
| E-P1-01j | SYS | Public | 4e candidature en une heure depuis la même IP (doublons compris) | 429 ; message « Trop de demandes envoyées depuis cet appareil. Réessayez dans quelques minutes. » (à jouer en dernier : bloque l'IP une heure) | N |
| E-P1-01k | CAND | Public | Pays dont `country_broker_onboarding_enabled` est fermé | Liste de pays vide : « Candidature momentanément indisponible » avec « Aucun pays n'accepte de nouvelle candidature de courtier pour le moment. » ; via l'API : 422 et message « La candidature pour ce pays n'est pas ouverte pour le moment. Laissez vos coordonnées via notre page Contact : nous vous recontacterons si elle rouvre. » | N |
| E-P1-01l | CAND | Public | XSS et SQL dans « Raison sociale » (160 caractères au plus), « Nom du contact », « Message » | Candidature acceptée ; aucune erreur 500 ; la fiche admin `/partners/applications/[applicationId]` affiche les chaînes en texte, sans exécution de script | N |
| E-P1-01m | CAND | Public | `/courtiers/candidature/confirmation` sans paramètre ou avec `?reference=` invalide | « Aucune candidature récente trouvée » et bouton « Revenir au formulaire de candidature » ; page non indexée | N |
| E-P1-01n | CAND | Public | Version anglaise `/en/brokers/apply` : même parcours | Libellés EN (« Legal name », « Contact e-mail », « Send my application »), « Application received », e-mail « Your AssurMatch partner application PA-… » | N |
| P1-02 | CA | Admin | `/partners/applications` → ouvrir la candidature → « Passer en examen » avec motif | « Candidature passée en examen. » ; statut « En examen » | C : scenario-core SC-02a |
| E-P1-02a | CA | Admin | « Passer en examen » avec un motif de moins de 8 caractères | « Motif obligatoire : au moins 8 caractères, conservé dans l'audit. » (bloqué avant l'API) | N |
| E-P1-02b | CA | Admin | « Passer en examen » deux fois (deux onglets) | Le second refus : 409 « The application is already under review » ; un seul changement d'état | N |
| E-P1-02c | AP | Admin | Un `admin_pays` ouvre la candidature et tente « Convertir en courtier » | E-mail de contact masqué ; conversion refusée 403 (réservée conformité et Super Admin) | N |
| P1-03 | CA | Admin | « Convertir en courtier » (motif obligatoire), confirmer « Convertir » | « Candidature convertie. » ; redirection `/partners/<id>?notice=converted` ; courtier « Prospect », licence « Brouillon » ; e-mail de décision au candidat | C : scenario-core SC-02a |
| E-P1-03a | CA | Admin | Convertir une candidature déjà convertie (deux onglets) | « Candidature déjà décidée : la décision est définitive. Rechargez la page. » (409 `APPLICATION_ALREADY_DECIDED`) | N |
| E-P1-03b | CA | Admin | Convertir alors que `country_broker_onboarding_enabled` est fermé | « Refusé : l'inscription des courtiers est désactivée pour ce pays (country_broker_onboarding_enabled). » | N |
| E-P1-03c | CA | Admin | Autre candidature : « Refuser la candidature » avec le motif « Licence invérifiable », confirmer « Refuser » ; puis tenter de la convertir | « Candidature refusée. Le candidat reçoit un e-mail neutre, sans la note interne. » ; la conversion suivante est refusée (409, décision définitive) | N |
| P1-04 | CA | Admin | Fiche `/partners/[partnerId]` : carte « Conditions d'activation » avant conformité | « 6 condition(s) non remplie(s). » avec : « Licence valide avec preuve d'agrement acceptee », « Autorisation pays active couverte par une licence valide », « Autorisation produit active couverte par une licence valide », « Utilisateur proprietaire invite ou actif », « Contrat de partenariat enregistre », « Onboarding courtier ouvert dans le pays » (le dernier est rempli si le flag pays est ouvert) | P : scenario-core SC-02b (état final seulement) |
| P1-05 | CA | Admin | Carte « Téléverser un document » : fichier `licence.pdf`, type « Licence / agrément », « Licence rattachée » = licence A, motif ; puis « Accepter » | « Document déposé et analysé sain. Il attend la revue de la conformité. » puis « Document accepté par la conformité. » | C : scenario-core SC-02b |
| E-P1-05a | CA | Admin | Téléverser `note.txt` ; `faux.pdf` (texte renommé) | « Document refusé : type de fichier non autorisé (PDF, JPEG ou PNG) ou contenu illisible. » (422 `DOCUMENT_INVALID`, `mime_not_allowed` ou `content_mismatch`) | N |
| E-P1-05b | CA | Admin | Téléverser `gros.pdf` (5 Mo plus 1 octet) | « Fichier trop volumineux : 5 Mo au maximum. » (413) | N |
| E-P1-05c | CA | Admin | Téléverser `eicar.pdf` | « Document déposé mais placé en quarantaine (analyse antivirus positive) : il ne sera jamais servi ni accepté. » ; badge « Quarantaine », libellé « Infecté (quarantaine) » ; pas de bouton « Télécharger » ; « Accepter » donne « Document en quarantaine ou non analysé : il ne peut être ni accepté ni téléchargé. » | N |
| E-P1-05d | CA | Admin | Téléverser sans fichier, sans type, avec un motif de 7 caractères | « Choisissez un fichier (PDF, JPEG ou PNG). » ; « Choisissez le type de document. » ; « Motif obligatoire : au moins 8 caractères, conservé dans l'audit. » | N |
| E-P1-05e | SYS | API | `POST /partners/<id>/documents` sans l'en-tête `x-assurmatch-upload: 1` (protection CSRF) | 403 « Requête refusée : origine non autorisée. » | N |
| P1-06 | CA | Admin | Carte « Licences » : « Valider » la licence (dialogue « Valider la licence ») | « Licence validée par la conformité. » ; statut « Valide » avec date d'expiration | C : scenario-core SC-02b |
| E-P1-06a | CA | Admin | « Valider » alors que la preuve n'est pas rattachée à la licence (champ « Licence rattachée » laissé à « Aucune ») | « Validation refusée : rattachez à la licence une preuve d'agrément acceptée et saine. » (422 `LICENSE_DOCUMENT_REQUIRED`) | N |
| E-P1-06b | CA | Admin | Licence dont la date d'expiration est passée ; renouvellement avec expiration avant la date d'effet | « Licence expirée : sa date d'expiration est passée. Enregistrez un renouvellement. » ; dates inversées : 400 | N |
| E-P1-06c | CA | Admin | « Valider » une licence déjà « Valide » | Refus 409 (`LICENSE_TRANSITION_INVALID`) | N |
| P1-07 | CA | Admin | Cartes « Pays autorisés » et « Produits autorisés » : « Autoriser ce pays » (CI), « Autoriser ce produit » (Assurance auto) | « Pays autorisé. » et « Produit autorisé. » | C : scenario-core SC-02b |
| E-P1-07a | CA | Admin | Autoriser un pays pour lequel le courtier n'a aucune licence | « Autorisation refusée : le courtier n'a aucune licence (brouillon ou valide) pour ce pays. » | N |
| E-P1-07b | CA | Admin | Autoriser un produit non couvert par la licence valide du pays | Refus 422 (couverture produit exige une licence valide couvrant le produit) **[À CONFIRMER : libellé]** | N |
| P1-08 | CA | Admin | Carte « Contrat de partenariat » : téléverser un document de type « Contrat de partenariat signé » (sain), saisir Version, Date de signature, Signataire, « Enregistrer le contrat » | « Contrat de partenariat enregistré. » | C : scenario-core SC-02b |
| E-P1-08a | CA | Admin | Enregistrer le contrat avec un document d'un autre type (preuve d'agrément) ou en quarantaine | « Contrat refusé : choisissez un document de type contrat de partenariat de ce courtier, analysé sain. » ; bouton grisé tant qu'aucun document éligible n'existe | N |
| E-P1-08b | CA | Admin | Enregistrer deux fois la même version | Refus 409 « Contract version X is already recorded » (texte brut) **[À CONFIRMER : texte affiché]** | N |
| P1-09 | CA | Admin | Carte « Utilisateurs du courtier » : « Inviter et émettre l'activation » (E-mail PROP, Nom affiché, rôle propriétaire du plan) | « Utilisateur … invité. E-mail d'activation envoyé. » ; e-mail « Activation de votre accès AssurMatch » avec lien `…:3603/activate?token=` | C : scenario-core SC-02b |
| E-P1-09a | CA | Admin | Inviter avec un e-mail déjà utilisé (un compte admin ou courtier existant) | « Conflit : cet élément existe déjà ou son état actuel ne permet pas cette action. Rechargez la page pour voir l'état à jour. » ; aucun e-mail envoyé | N |
| E-P1-09b | CA | Admin | E-mail invalide ; nom affiché de 1 caractère ; rôle autre que le propriétaire du plan (propriétaire Pro sur un plan Starter) | 400 pour les deux premiers ; 422 `PARTNER_USER_INVALID` pour le rôle | N |
| P1-10 | CA | Admin | « Envoyer en vérification » puis « Passer en Actif public » | Statut « Statut du courtier passé à « Actif public ». » ; carte « Toutes les conditions d'activation sont remplies. » | C : scenario-core SC-02b |
| E-P1-10a | CA | Admin | « Passer en Actif public » alors que le contrat n'est pas enregistré | « Activation refusée : des conditions d'activation ne sont pas remplies. Corrigez-les puis recommencez. » avec la liste et un lien « Corriger » par ligne (422 `PARTNER_ACTIVATION_BLOCKED`) | N |
| E-P1-10b | CA | Admin | Passer un « Prospect » directement en « Actif public » | « Changement de statut refusé : cette transition n'est pas permise depuis le statut actuel. Rechargez la page. » (409) | N |
| E-P1-10c | AP | Admin | Un `admin_pays` tente « Passer en Actif public » | Refus 403 (seul « Envoyer en vérification » lui est ouvert) | N |
| E-P1-10d | CA | Admin | « Passer en Actif test » : un visiteur demande un devis | Le courtier `active_test` ne reçoit **aucun** lead réel (seul `active` est routable) | N |
| E-P1-10e | CA | Admin | Deux onglets modifient la fiche courtier | « Conflit de mise à jour : la fiche courtier a été modifiée depuis son chargement. Rechargez la page puis recommencez. » (409 `PARTNER_UPDATE_CONFLICT`) | N |
| E-P1-10f | SA | Admin | Courtier B créé directement avec un RCCM déjà utilisé dans le pays ; puis « Résilier » B | « Doublon : un courtier avec ce numéro RCCM existe déjà dans ce pays. » (409) ; après résiliation : « Courtier résilié : aucune modification ni invitation n'est plus possible. » ; la résiliation est définitive | P : partners.ts (création directe), pas le doublon |

## 7. Phase 2 — Le courtier active son compte et configure sa société

Acteur : PROP. App : Broker. Routes : `/activate`, `/login`, `/mfa`, `/company`, `/licenses`, `/team`, `/account/security`, `/password-reset`, `/password-change`.

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| P2-01 | PROP | Broker | Ouvrir le lien d'activation de Mailpit ; champs « Jeton activation » (prérempli) et « Nouveau mot de passe » ; « Activer et continuer vers MFA » | Cookie de session posé ; redirection `/mfa` | C : scenario-core SC-03 |
| E-P2-01a | PROP | Broker | Mot de passe de 11 caractères | Bloqué par le champ (« 12 caractères minimum. ») ; via l'API : 400 | N |
| E-P2-01b | PROP | Broker | Mot de passe identique à l'e-mail ou au nom affiché ; mot de passe de la liste noire (`assurmatch123`) | Refus (« Password must not match email », « Password is too common »). Le texte contient « password » : il est masqué par « The request could not be processed safely » et l'écran affiche un texte brut (`api_500` ou équivalent) **[À CONFIRMER]**. Attendu fonctionnel : activation refusée, jeton non consommé | N |
| E-P2-01c | PROP | Broker | Mot de passe `aaaaaaaaaaaa` (12 caractères, sans complexité) | Accepté : aucune règle de complexité (H3). Consigner | N |
| E-P2-01d | PROP | Broker | Ouvrir le lien après plus de 30 minutes (jeton expiré) | Activation refusée ; l'écran affiche `validation_error` **[À CONFIRMER]** ; aucune session ; l'admin réémet l'accès (« Réinitialisation mot de passe » → « Émettre un jeton ») | N |
| E-P2-01e | PROP | Broker | Rouvrir le lien d'activation déjà utilisé ; modifier un caractère du jeton | Refus identique dans les deux cas (« Invalid activation token » : aucune distinction expiré, utilisé ou falsifié) | N |
| P2-02 | PROP | Broker | `/mfa` : « Générer secret et codes de secours », noter le secret, saisir le code TOTP, « Vérifier MFA » | Secret, URI et 8 codes de secours affichés une seule fois ; « Portail courtier » visible | C : scenario-core SC-03 |
| E-P2-02a | PROP | Broker | Code TOTP erroné ; code de moins de 6 caractères | Erreur ; reste sur `/mfa` ; code court bloqué par le champ ; chaque échec compte vers le verrouillage | N |
| E-P2-02b | PROP | Broker | Rejeter le même code TOTP | Voir E-P0-01e (rejeu non empêché par le code) | N |
| E-P2-02c | PROP | Broker | 5 échecs (mot de passe ou MFA, compteur partagé) | Compte « locked » ; ensuite même le bon mot de passe est refusé avec le message générique « Accès refusé ou identifiants invalides. » (l'avis « Compte verrouillé » n'est jamais émis par l'API) ; déblocage par l'admin (`/users/[userId]`, action « unlock ») ou par réinitialisation du mot de passe | N |
| E-P2-02d | PROP | Broker | Cliquer deux fois « Générer secret » avant de confirmer | Un nouveau secret remplace l'ancien (l'ancien ne fonctionne plus) ; une fois la MFA confirmée, le ré-enrôlement exige une session déjà MFA-vérifiée (403 `MFA_REQUIRED`) | P : recos-063 MFA-04 (403 sans MFA) |
| E-P2-02e | PROP | Broker | Accéder directement à `/leads` avec le seul mot de passe (sans MFA) | Redirection `/login` (notice « MFA requise… ») ; API : 403 sur route protégée | C : recos-063-mfa-disputes MFA-04 |
| P2-03 | PROP | Broker | Se déconnecter, se reconnecter (`/login` puis MFA) ; option « Faire confiance à cet appareil pendant 30 jours » | Code MFA toujours demandé ; appareil de confiance : plus de code dans le même contexte, mot de passe toujours exigé ; `/account/security` : « Révoquer tous les appareils de confiance » | C : recos-063-mfa-disputes MFA-01, MFA-02, MFA-03 |
| E-P2-03a | PROP | Broker | Session de 15 minutes expirée | `/login?reason=session_required` « Connectez-vous pour accéder au back-office. » ou `reason=session_expired` « Votre session a expiré. Connectez-vous à nouveau. » ; retour à la page demandée après connexion | N |
| E-P2-03b | PROP | Broker | `/password-reset?token=` avec un jeton valide puis le même ; `/password-change` avec un mauvais mot de passe actuel puis le bon | « Mot de passe réinitialisé. Vous pouvez vous connecter. » ; second usage refusé ; mauvais mot de passe actuel refusé ; succès « Mot de passe modifié. » avec révocation des appareils de confiance | N |
| E-P2-03c | PROP | Broker | Se connecter à l'app courtier après s'être connecté à l'admin dans le même navigateur | Aucune session partagée (cookies `assurmatch_admin_token` et `assurmatch_broker_token` distincts) | N |
| P2-04 | PROP | Broker | `/company` : « E-mail principal », « WhatsApp principal » (`+2250102030405`), « Ville », contacts administratif et commercial, « Assureurs partenaires », « Enregistrer » | « Profil mis à jour. La modification est tracée dans le journal d'audit. » ; valeurs conservées après rechargement | C : scenario-core SC-03 |
| E-P2-04a | PROP | Broker | WhatsApp `0102030405` ; e-mail invalide ; 21 assureurs ; ville d'un caractère | « Données invalides : vérifiez les champs (e-mail, téléphone au format +225..., justification de 10 caractères au moins, motif de 8 caractères au moins). » ; rien n'est enregistré | N |
| E-P2-04b | PROP | Broker | Vider un champ déjà renseigné puis « Enregistrer » | La valeur actuelle est conservée (un contact ne peut pas être effacé) | N |
| E-P2-04c | PROP | Broker | Deux onglets : enregistrer dans l'un, puis dans l'autre | « La fiche a été modifiée entre-temps : rechargez la page puis recommencez. » (`PARTNER_UPDATE_CONFLICT`) | N |
| E-P2-04d | PROP | Broker | « Demander une modification d'identité » : justification de 9 caractères ; aucun champ rempli ; demande identique envoyée deux fois | Refus de la justification (10 à 1000 caractères) ; « Renseignez au moins un champ à modifier. » ; « Une demande identique est déjà en attente de décision d'AssurMatch. » ; succès « Demande transmise : AssurMatch l'examine. Les valeurs actuelles restent en vigueur jusqu'à sa décision. » ; l'identité légale n'est jamais modifiée directement | N |
| E-P2-04e | PROP | Broker | XSS dans « Ville » et « Assureurs partenaires » | Affichés comme texte sur `/company`, sur la fiche admin et sur la fiche publique du courtier (`/pays/CI/courtiers/<id>`) ; aucun script exécuté | N |
| E-P2-04f | AGT | Broker | L'agent ouvre `/company` | Lecture seule : « Lecture seule : seuls le propriétaire et les managers modifient le profil et déposent des demandes. » ; écriture API 403 « Action refusée : seuls le propriétaire et les managers du courtier peuvent faire cette action. » | P : pro-03-roles PRO-ROLES-01 (leads) ; société non couverte |
| P2-05 | PROP | Broker | `/licenses` | Licence « Valide » avec date d'expiration | C : scenario-core SC-03 |
| E-P2-05a | PROP | Broker | Renouvellement : expiration avant la date d'effet ; expiration passée | « Dates incohérentes : l'expiration doit suivre la date d'effet. » ; « La date d'expiration du renouvellement doit être future. » | N |
| E-P2-05b | PROP | Broker | Preuve : `note.txt` ; `gros.pdf` | « Fichier refusé : PDF, JPEG ou PNG de 5 Mo au plus, au contenu conforme à son type. » ; trop volumineux : « Fichier trop volumineux : 5 Mo au maximum. » | N |
| E-P2-05c | PROP | Broker | Renouvellement déposé, licence « En revue par la conformité » | Notice « En revue par la conformité AssurMatch : la licence n'est pas utilisée pour le routage avant sa validation. » | N |
| P2-06 | PROP | Broker | `/team` : « Inviter un collaborateur » : « Nom affiché », « E-mail professionnel », « Rôle » Agent, « Inviter » | « Invitation envoyée : le collaborateur active son compte depuis l'e-mail reçu et enrôle sa MFA à la première connexion. » ; MFA « À enrôler » | C : scenario-core SC-03 |
| E-P2-06a | PROP | Broker | Inviter un e-mail déjà utilisé | « Action impossible dans l'état actuel (déjà autorisé, déjà traité ou adresse indisponible). » (409 neutre, l'adresse n'est pas révélée) | N |
| E-P2-06b | PROP | Broker | Nom d'un caractère ; e-mail invalide ; rôle propriétaire via l'API | 400 ; le rôle propriétaire n'est pas proposé et l'API le refuse | N |
| E-P2-06c | PROP | Broker | Se désactiver soi-même ; désactiver le dernier propriétaire ; motif de 7 caractères | « Vous ne pouvez pas modifier votre propre accès ni votre propre rôle. » (422 `TEAM_SELF_ACTION`) ; « Le dernier propriétaire actif ne peut pas être désactivé. » (422 `TEAM_LAST_OWNER`) ; motif de 8 caractères exigé | N |
| E-P2-06d | PROP | Broker | Désactiver l'agent pendant qu'il est connecté | Son accès est coupé à sa prochaine requête (au plus 30 s) : retour au `/login` ; message « Collaborateur désactivé : son accès est coupé dès sa prochaine requête. » côté propriétaire ; « Réactiver » rétablit | P : pro-03-roles (rôles), pas la désactivation en cours de session |
| E-P2-06e | AGT, LEC | Broker | L'agent et le lecteur ouvrent `/team` et `/offers/new` | Écriture refusée : « Action refusée : seuls le propriétaire et les managers du courtier peuvent faire cette action. » ; « Création réservée au propriétaire et aux managers du cabinet. Les agents et les comptes en lecture seule consultent uniquement. » | P : pro-03-roles PRO-ROLES-01, -02 (CRM) |

## 8. Phase 3 — Le courtier ajoute ses produits (offres, garanties, prix)

Acteur : PROP. App : Broker. Routes : `/offers`, `/offers/new`, `/offers/[offerId]`. Statuts d'offre : Brouillon, « En attente de validation », Publiée, Suspendue, Retirée, Expirée. Il n'existe pas de statut « Rejetée » ni « Archivée » au niveau de l'offre : un refus renvoie la version en brouillon avec un motif ; il n'y a ni bouton « Dupliquer » ni « Archiver ».

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| P3-01 | PROP | Broker | `/offers/new` : « Pays — Produit » (Côte d'Ivoire, Assurance auto), « Assureur porteur du risque », « Nom commercial » `Auto Confort <sfx>`, « Description », « Résumé des garanties », « Niveau de garantie (1 à 5) », section « Garanties (liste détaillée) » (3 lignes avec « Ajouter une garantie »), « Exclusions », « Franchise », « Prime minimale », « Prime maximale », « Devise » XOF, « Unité de prix », « Fractionnement du paiement », « Début de validité », « Fin de validité », « Source de l'information » ; « Créer le brouillon » | « Offre créée en brouillon (version 1). Complétez-la puis soumettez-la à validation. » ; checklist « Complétude N % » et « Minimum atteint : soumission possible » | C : scenario-core SC-04a |
| E-P3-01a | PROP | Broker | « Nom commercial » vide ; 161 caractères ; description de 1001 caractères | Champ obligatoire / « Données invalides : vérifiez les champs (dates, prix minimal inférieur au maximal, 50 garanties au plus, motif de 8 caractères au moins). » ; aucune offre créée | N |
| E-P3-01b | PROP | Broker | Prime minimale 140000 et maximale 80000 | « Prix invalide : la prime minimale dépasse la prime maximale. » | N |
| E-P3-01c | PROP | Broker | Prime négative ; prime 0 ; devise de 2 lettres | Négative et devise invalide : refus 400 « Données invalides… ». Prime 0 : **acceptée** par le code (H7), à valider par le produit | N |
| E-P3-01d | PROP | Broker | Fin de validité avant le début ; fin de validité dans le passé | « Dates incohérentes : la fin de validité doit être postérieure au début. » ; fin passée : brouillon créé mais la soumission est refusée (checklist « Fin de validité future ») | N |
| E-P3-01e | PROP | Broker | Ajouter 51 garanties | « Ajouter une garantie » désactivé à 50 ; via l'API : 400 (`OFFER_MAX_GUARANTEES`) | N |
| E-P3-01f | PROP | Broker | Garanties laissées vides, « Créer le brouillon » puis « Soumettre à validation » | Brouillon accepté (lignes vides ignorées) ; soumission : 422 « Soumission refusée : la complétude minimale n'est pas atteinte. Complétez les champs listés. » avec « Champ obligatoire manquant : Garanties (au moins une) » ; avertissement préalable « Complétude minimale non atteinte : la soumission sera refusée avec la liste des champs manquants. » | N |
| E-P3-01g | PROP | Broker | Description contenant « souscrire maintenant » (puis « acheter maintenant ») | « Formulation réglementée interdite détectée : « … ». Reformulez le champ concerné. » ; aucune offre enregistrée | N |
| E-P3-01h | PROP | Broker | Description contenant « contrat validé » (avec accent) | **Non bloqué** côté offres : la liste des offres compte 7 expressions à l'accent exact (« contrat valide » sans accent est bloqué). Écart avec la messagerie, qui normalise les accents. Consigner (H8) ; la conformité doit refuser l'offre à la revue | N |
| E-P3-01i | PROP | Broker | Créer deux offres au même nom commercial | Aucune règle d'unicité : les deux sont créées, la clé publique de la seconde est suffixée `-2` (H9) | N |
| E-P3-01j | PROP | Broker | Pays ou produit non couvert par la licence (courtier A, produit Voyage) | La liste « Pays — Produit » ne propose que les couvertures licenciées ; sans couverture : « Aucune couverture licenciée : contactez AssurMatch pour compléter votre dossier. » et bouton désactivé ; via l'API : 422 « Périmètre non couvert : votre cabinet n'a pas de licence valide et d'autorisations actives pour ce pays et ce produit. Contactez AssurMatch pour étendre votre couverture. » | N |
| E-P3-01k | PROP | Broker | XSS et SQL dans « Nom commercial », « Description », « Source de l'information » | Offre créée ; chaînes affichées comme texte dans l'app courtier, la file admin et le comparateur public ; aucune exécution, aucune erreur 500 | N |
| E-P3-01l | PROP | Broker | Double clic sur « Créer le brouillon » | Une seule offre (bouton désactivé pendant l'envoi) | N |
| E-P3-01m | PROP-B | Broker | Ouvrir l'URL `/offers/<id de l'offre de A>` | « Offre introuvable » : « Cette offre n'existe pas ou n'appartient pas à votre cabinet. » (API 404 « Offre introuvable. ») ; aucune donnée de A | N |
| E-P3-01n | PROP | Broker | Changer le « Type d'offre » d'une offre existante | 422 « Le type d'une offre ne peut pas changer après sa création. Créez une nouvelle offre du type voulu. » | N |
| E-P3-01o | LEC | Broker | Le lecteur tente d'enregistrer une offre | « Action réservée au propriétaire et aux managers du cabinet. Les agents et les comptes en lecture seule consultent uniquement. » | N |
| P3-02 | PROP | Broker | Fiche de l'offre → « Soumettre à validation » ; créer aussi `Auto Eco <sfx>` et `Auto Premium <sfx>` et les soumettre | « Version soumise : elle est en attente de validation par AssurMatch. » ; statut « En attente de validation » ; l'offre n'est pas publique | C : scenario-core SC-04a (une offre) |
| E-P3-02a | PROP | Broker | « Soumettre à validation » deux fois (deux onglets) | Le second : « Action impossible dans l'état actuel de l'offre (version déjà soumise, aucune version en cours ou offre retirée). Rechargez la page. » (409) | N |
| E-P3-02b | PROP | Broker | Modifier une version déjà soumise | Notice : « Cette version est en attente de validation : la modifier la renvoie en brouillon, et une nouvelle soumission sera nécessaire. » | N |
| E-P3-02c | PROP | Broker | Deux onglets enregistrent l'offre | « Conflit de version : l'offre a été modifiée depuis son chargement. Rechargez la page puis recommencez. » (409 `OFFER_VERSION_CONFLICT`) | N |
| E-P3-02d | PROP | Broker | Visiteur ouvre `/pays/CI/produits/auto/offres` avant validation | Aucune offre du courtier A (brouillon et en attente jamais publics) | N |

## 9. Phase 4 — Validation par la plateforme et publication

Acteur : CA (Admin), puis V1 (Public). Routes admin : `/offers`, `/offers/[offerId]`, `/catalog/countries/[countryId]`. Les boutons de décision s'appellent « Valider et publier », « Refuser », « Suspendre » (le mot « Rejeter » n'existe pas dans l'écran des offres) ; chaque décision demande un « Motif (audité) » de 8 caractères au moins.

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| P4-01 | CA | Admin | `/offers` : l'offre est dans la file → fiche → « Valider et publier » avec motif | « Version validée et publiée. Le courtier est notifié. » ; notification « Offre validée » côté courtier ; bouton « Suspendre » disponible | C : scenario-core SC-04b |
| E-P4-01a | CA | Admin | Refuser `Auto Eco <sfx>` : « Refuser » avec motif | « Version refusée : elle repasse en brouillon avec le motif, visible du courtier. » ; côté courtier : notice « Motif du dernier refus », colonnes « Décision » (« Refusée le … ») et « Motif » de l'historique, notification « Offre refusée » ; rien ne change au public. L'offre peut être corrigée et resoumise | N |
| E-P4-01b | CA | Admin | Motif de 7 caractères | Refus avant l'API (motif de 8 caractères au moins) | N |
| E-P4-01c | AP, SU | Admin | Un `admin_pays` ou `support_admin` ouvre la fiche de l'offre | Badge « Décisions réservées à la conformité » ; décision forcée via l'API : 403 « Action refusée : droits insuffisants ou hors périmètre pays. » | N |
| E-P4-01d | CA | Admin | Valider une offre dont la fin de validité est passée, sans mention « offre indicative », ou dont le courtier n'est pas actif | 422 `OFFER_VALIDATION_BLOCKED` avec la liste : « Offre expirée : la date de fin de validité est passée », « Mention « offre indicative » absente », « Courtier non actif », « Aucune licence valide du courtier pour ce pays et ce produit », « Capacité du courtier bloquée ou pleine » | N |
| E-P4-01e | CA | Admin | « Suspendre » `Auto Premium <sfx>` publiée, puis « Valider et publier » (réintégration) | Offre retirée du comparateur en moins d'une minute ; courtier : notice « Offre suspendue par AssurMatch », notification « Offre suspendue » ; la réintégration repasse par une validation | P : forbidden-cases-pro SC-10-LIC-4 (suspension par la licence) |
| E-P4-01f | CA, SA | Admin | Deux onglets décident la même version | Le second : « Conflit de version : l'offre a été modifiée depuis son chargement. Rechargez la page puis recommencez. » | N |
| E-P4-01g | PROP | Broker | Modifier une offre publiée (nouveau prix) | Création d'une nouvelle version brouillon ; la version publiée reste en ligne ; cartes « Version publiée » et « Version en cours » ; l'admin voit « Différences entre la version publiée et la version en cours » ; après validation, la nouvelle remplace l'ancienne | N |
| E-P4-01h | PROP | Broker | « Retirer l'offre du public » (motif de 8 caractères) ; offre à fin de validité passée | « Offre retirée du public. Son historique est conservé. » ; offre expirée : notice « Offre expirée » (« Renouveler l'offre » : « Nouveau début de validité » et « Nouvelle fin de validité », nouvelle version à valider) | N |
| E-P4-01i | CA | Admin | Courtier suspendu ou résilié : la conformité valide son offre | Validation bloquée (« Courtier non actif ») ; écriture du courtier : « Courtier suspendu : aucune écriture n'est possible sur ses offres. » | N |
| P4-02 | CA | Admin | Pays CI : `country_public_enabled`, statut `public` | Checklist « Aucun contrôle bloquant » ; `/pays/CI` répond côté public | C : scenario-core SC-01c |
| E-P4-02a | CA | Admin | Ouvrir un pays sans courtier actif public ni offre | Refus avec les motifs ; le pays reste `pilot` | C : senegal-opening SN-05 |
| P4-03 | V1 | Public | `/pays/CI/produits/auto/offres` | `Auto Confort <sfx>` listée, « prix indicatif, à confirmer par le courtier partenaire », « Courtier partenaire responsable », mention « Offre indicative, prix indicatif, à confirmer par le courtier partenaire. » | C : scenario-core SC-05 (partie comparateur) |
| E-P4-03a | V1 | Public | Ouvrir `/offres/<id>` d'une offre en brouillon, suspendue, expirée ou d'un courtier suspendu | Page 200 « Offre indisponible » (pas de 404) avec « Cette offre n'est plus affichée publiquement. » et le bouton « Comparer les offres » | N |
| E-P4-03b | V1 | Public | Offre privée validée | Absente de la liste, de la comparaison et du devis | C : visitor-gaps-03-catalog VGC-03 |
| E-P4-03c | V1 | Public | `/pays/CI/produits/voyage` et `/devis` pour un produit non publié | « Fiche produit indisponible » ; « Demande de devis indisponible » (« La demande de devis n'est pas disponible pour ce pays ou ce produit. ») ; API : 404 « Country or product is not available » ou 422 « Quote request is disabled » | P : forbidden-cases SC-09b (produit fermé) |

## 10. Phase 5 — Le visiteur compare et demande un devis

Acteur : V1 (sans compte, H1). App : Public. Routes FR : `/pays/CI`, `/pays/CI/produits/auto/offres`, `/comparer`, `/pays/CI/produits/auto/devis?offerId=…`, `/demandes-de-devis/QR-…?token=…`, `/suivi` (EN : `/en/countries/CI`, `/en/countries/CI/products/auto/offers`, `/en/compare`, `/en/countries/CI/products/auto/quote`, `/en/quote-requests/QR-…`, `/en/track`).

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| P5-01 | V1 | Public | `/pays/CI` → « Comparer les offres » → Assurance auto ; tri « Prix indicatif croissant » ; filtres budget | Offre listée, marquée indicative, avec le courtier responsable ; tri et filtres appliqués | C : scenario-core SC-05 ; P : visitor-gaps-03 VGC-02 |
| E-P5-01a | V1 | Public | Filtres sans résultat (budget maximal 1) | « Aucune offre indicative pour ces critères » et bouton « Effacer les filtres » | N |
| E-P5-01b | V1 | Public | `/comparer` avec 1 offre, puis 5 offres ; offres de deux produits | « Sélection incomplète » : « Sélectionnez entre 2 et 4 offres indicatives du même pays et du même produit pour les comparer. » | N |
| E-P5-01c | V1 | Public | `/pays/SN` (pays en brouillon) ; pays pilote sans courtier ni offre | Brouillon : « Page introuvable » (404) ; pilote : produits listés avec état « aucune offre », aucun courtier | C : forbidden-cases SC-09a, senegal-opening SN-06 |
| E-P5-01d | V1 | Public | Flag `public_comparator_enabled` ou produit fermé dans l'admin | Les offres disparaissent immédiatement du parcours public | C : forbidden-cases SC-09b |
| E-P5-01e | V1 | Public | Aucun courtier éligible pour les offres (courtier suspendu) | Aucun message dédié : liste vide « Aucune offre indicative pour ces critères » | P : forbidden-cases SC-09e |
| P5-02 | V1 | Public | « Demander un devis » depuis la carte de l'offre (`?offerId=`) : étape « Votre besoin » (« Usage du véhicule », « Marque du véhicule », « Ville », « Moyen de contact préféré »), « Continuer » ; étape « Vos coordonnées » (« Prénom », « Nom », « Adresse e-mail », « Téléphone »), « Vérifier ma demande » | Étape de vérification avec récapitulatif ; le nom complet apparaît | C : scenario-core SC-05, visitor-gaps-01 VG-01 |
| E-P5-02a | V1 | Public | Champs obligatoires vides (« Usage du véhicule », « Ville », « Moyen de contact préféré », e-mail, téléphone) | « Ce champ est obligatoire. Indiquez une valeur avant de continuer. » ; focus sur le premier champ invalide | N |
| E-P5-02b | V1 | Public | E-mail `nom@domaine` ; téléphone `0102030` ; téléphone 9 chiffres pour CI | « Adresse e-mail invalide. Vérifiez le format, par exemple nom@domaine.com. » ; « Format attendu : +225 suivi de 10 chiffres, ou 10 chiffres sans indicatif. » ; `+2250102030405` et `0102030405` acceptés | N |
| E-P5-02c | SYS | API | `POST /quote-requests` avec un téléphone non conforme au pays | 400 « Phone is invalid for country » ; écran « Le numéro de téléphone ne correspond pas au format attendu pour ce pays. » | N |
| E-P5-02d | V1 | Public | « Budget indicatif » négatif ou texte ; XSS et SQL dans « Marque du véhicule », « Ville », « Prénom » | Nombre : refus client ; chaînes d'injection : demande acceptée (aucune neutralisation côté serveur, le rendu échappe) ; affichées comme texte chez le courtier, l'admin et dans les e-mails ; aucun 500 | N |
| E-P5-02e | V1 | Public | Champ libre de 10 000 caractères | Aucune limite serveur sur `answers` : la demande ne doit pas provoquer de 500 ; consigner la taille acceptée (risque de volumétrie) **[À CONFIRMER]** | N |
| E-P5-02f | V1 | Public | Recharger la page en cours de saisie | Les saisies sont perdues (aucun brouillon visiteur ; la spec 043 concerne les formulaires admin) | N |
| E-P5-02g | V1 | Public | Étape « Documents (facultatif) » : 6 fichiers ; `note.txt` ; 5 Mo plus 1 octet ; fichier vide | « « {nom} » n'a pas été ajouté : 5 documents au maximum par demande. » ; « « {nom} » n'est pas accepté : formats PDF, JPEG ou PNG uniquement. » ; « « {nom} » est trop volumineux : 5 Mo maximum par fichier. » ; « « {nom} » est vide et n'a pas été ajouté. » | P : visitor-gaps-01 VG-02 (flag documents) |
| P5-03 | V1 | Public | Lire le consentement (nomme le courtier), cocher, « Envoyer ma demande » | « Demande reçue » ; référence `QR-AAAA-XXXXXXXX` (majuscules) ; « Votre demande a été transmise à E2E Courtage <sfx>. » ; e-mail « Votre demande de devis QR-… est bien reçue » | C : scenario-core SC-05 |
| E-P5-03a | V1 | Public | Envoyer sans cocher le consentement (écran, puis API) | « Le consentement est obligatoire avant toute transmission. » (ou info-bulle native du navigateur, **[À CONFIRMER]**) ; l'API refuse ; aucune demande transmise | C : forbidden-cases SC-09c |
| E-P5-03b | V1 | Public | Le consentement est republié entre le chargement et l'envoi | « Le texte de consentement a été mis à jour. Rechargez la page pour lire la version en vigueur avant d'envoyer votre demande. » (422) | N |
| E-P5-03c | V1 | Public | Double clic sur « Envoyer ma demande » | Bouton désactivé : une seule demande `QR-` | N |
| E-P5-03d | V1 | Public | Même e-mail, même pays, même produit dans les 30 jours | « Une demande récente similaire existe déjà; aucun courtier partenaire n'est notifié une seconde fois. » ; aucun second lead chez le courtier. Anomalie probable à confirmer : référence affichée « duplicate » et lien `?token=duplicate` (écran neutre « Ce lien de suivi ne permet pas d'afficher une demande ») | N |
| E-P5-03e | V1, V2 | Public | Deux visiteurs avec le même téléphone et des e-mails différents | Deux demandes distinctes, chacune avec son lien de suivi ; signal `possible_duplicate` côté admin sans blocage | C : recos-066-shared-phone F1-01 à F1-03 |
| E-P5-03f | SYS | Public | 6 envois en une minute (même IP, pays, produit) | 429 « Trop de demandes. Réessayez plus tard. » | N |
| E-P5-03g | SYS | API | `answers.website` rempli (honeypot, absent de l'interface) | « Spam submission blocked » ; aucune demande | N |
| E-P5-03h | V1 | Public | Plusieurs offres (flag multi-courtiers fermé, puis ouvert) ; courtier choisi non retenu | Fermé : seule la première offre est retenue (« Seule la première offre a été retenue. ») ; ouvert : jusqu'à 3 avec consentement nommant chaque courtier ; courtier non retenu : « Le courtier de l'offre choisie n'était pas disponible : votre demande a été orientée vers un autre courtier partenaire agréé. » | C : visitor-gaps-01 VG-03, VG-04, VG-05 |
| E-P5-03i | V3 | Public | Devis Voyage (aucun courtier autorisé) ou courtier A suspendu | Confirmation « Demande reçue » avec « Votre demande a été reçue et reste à confirmer par un courtier partenaire. » ; espace de suivi « Demande non transmise » : « Aucun courtier partenaire éligible n'a pu être identifié pour cette demande. Aucune promesse de rappel n'est faite. » ; e-mail « Votre demande de devis QR-… » ; admin : « Aucun courtier disponible » / « Non routable » ; aucun lead chez aucun courtier | N |
| E-P5-03j | V1 | Public | Parcours en anglais jusqu'à la confirmation | Libellés EN (« Continue », « Review my request », « Send my request », « Request received », « Public reference: ») ; la phrase d'information du serveur reste en français (texte venant de l'API balisé `lang="fr"`) | N |
| P5-04 | V1 | Mailpit, Public | Ouvrir l'e-mail de confirmation, suivre le lien `/demandes-de-devis/QR-…?token=…` (« Suivre ma demande et ajouter des documents (optionnel) ») | Espace de suivi : « Suivi de la demande QR-… », statut, courtier ; le lien est la « connexion » du visiteur (H1) ; réutilisable (usage multiple, valable 30 jours : « Ce lien de suivi est personnel et reste valable jusqu'au … ») | C : scenario-core SC-05 |
| E-P5-04a | V1 | Public | Jeton altéré, tronqué (moins de 16 caractères) ou absent | Écran « Ce lien de suivi ne permet pas d'afficher une demande » avec « Recevoir un nouveau lien » (page 200) ; API : 404 `VISITOR_ACCESS_DENIED` « Quote status not available » ; même réponse pour jeton expiré, révoqué, demande anonymisée ou référence inconnue | C : visitor-tracking (lien magique) |
| E-P5-04b | V1, V2 | Public | Utiliser le jeton de V1 avec la référence QR de V2 | Même réponse neutre 404, aucune donnée de V2 | N |
| E-P5-04c | V1 | Public | `/suivi` : référence inconnue ; bon e-mail avec mauvaise référence ; bon couple | Toujours « Demande prise en compte. Si cette référence correspond à cette adresse e-mail, un nouveau lien de suivi vient d'y être envoyé. » ; e-mail « Votre lien de suivi (QR-…) » (nouveau jeton) seulement pour le bon couple ; honeypot rempli : même réponse sans effet | C : visitor-tracking (renvoi) |
| E-P5-04d | V1 | Public | `/suivi` : référence ou e-mail invalides ; 6e demande en une heure | « Indiquez une référence valide (lettres, chiffres et tirets). » ; « Indiquez une adresse e-mail valide. » ; limite : « Trop de demandes en peu de temps. Réessayez dans une heure. » (5 par IP et par heure, 3 par référence) | N |
| E-P5-04e | V1 | Public | En-têtes de la page de suivi | `Referrer-Policy: no-referrer`, `Cache-Control: no-store` ; seul le jeton figure dans l'URL (aucune donnée personnelle) | N |

## 11. Phase 6 — Le courtier traite le lead : acceptation, proposition, messagerie, documents

Acteurs : PROP, AGT, LEC, PROP-B (Broker), V1 (Public), SA et CA (Admin). Routes courtier (plan Starter) : `/leads`, `/leads/[leadAssignmentId]`, `/notifications` (plans Pro et Enterprise : `/crm/leads/[leadAssignmentId]`). Statuts Starter : Assigné, Courtier notifié, Vu, Accepté, Rejeté, Contesté, Clôturé.

### 11.1 Réception et acceptation

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| P6-01 | PROP | Broker | `/leads` → ouvrir le lead (colonnes Référence, Pays, Produit, Statut, Date, Vu) | Le lead passe « Vu » (audité) ; carte « Contact consenti » avec e-mail et téléphone du visiteur ; cartes « Informations utiles », « Réponses consenties », « Historique minimal » | C : scenario-core SC-06 |
| E-P6-01a | PROP-B | Broker | Ouvrir l'URL du lead de A ; ouvrir un identifiant inexistant ; lister `/leads` | Lead de A : « Accès refusé » (« Ce lead n'est pas accessible avec votre tenant, vos permissions ou votre MFA. Aucune donnée protégée n'est affichée. », API 403, incident audité `cross_tenant_access`) ; inexistant : « Lead introuvable » (404) ; la liste de B est vide de leads de A | C : forbidden-cases SC-09d |
| E-P6-01b | PROP, PROP-B | Broker | Deux courtiers éligibles pour le même produit ; demande sans offre choisie | Un seul reçoit le lead (règle de routage) ; l'autre n'en voit aucune trace ; aucun courtier ne voit l'identité d'un co-destinataire | P : visitor-gaps-01 VG-03 à VG-05 |
| E-P6-01c | PROP | Broker | Lead dont une réponse du devis contient XSS et SQL ; export CSV de `/leads` avec une valeur `=HYPERLINK(…)` | Texte échappé dans la fiche ; export « Exporter (CSV) » : cellule préfixée de `'` (neutralisation des formules), aucune donnée de contact | P : recos-064 W064-01 (CSV sans contact) |
| E-P6-01d | AGT, LEC | Broker | L'agent (Pro) ouvre un lead non assigné ; le lecteur tente une action | Agent : seuls ses leads assignés ; lecteur : consultation seule, boutons « Accepter », « Rejeter avec motif », « Contester avec motif » grisés | C : pro-03-roles PRO-ROLES-01, -02 |
| P6-02 | PROP | Broker | « Accepter » | « Lead accepté. L'action est historisée avec acteur et date. » ; e-mail visiteur « Votre demande de devis QR-… est prise en charge » | C : scenario-core SC-06 |
| E-P6-02a | PROP | Broker | « Rejeter avec motif » sans motif, puis avec « Doublon » ; ensuite « Accepter » | « Un motif allowliste est obligatoire pour rejeter ou contester un lead. » ; avec motif : statut « Rejeté » (motifs : « Qualité du lead insuffisante », « Hors périmètre pays ou produit », « Prospect injoignable », « Doublon », « Point de conformité ») ; l'acceptation n'est plus proposée | N |
| E-P6-02b | PROP | Broker | « Contester avec motif » deux fois ; au-delà de 30 jours | Statut « Contesté » ; seconde contestation refusée ; passé 30 jours : « La contestation n'est plus possible : la fenêtre de 30 jours est close depuis le … » | C : recos-063 DSP-01, DSP-02 |
| E-P6-02c | PROP | Broker | « Accepter » depuis deux onglets ; « Clôturer » un lead non accepté | Une seule acceptation (second appel refusé) **[À CONFIRMER : statut]** ; clôture : « Clôture refusée : le lead doit être accepté et ne pas être déjà clôturé. » (409 `LEAD_NOT_ACCEPTED`) | N |

### 11.2 Proposition au visiteur (« Répondre au visiteur », spec 055)

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| P6-03 | PROP | Broker | « Message au visiteur », « Prime indicative (ou minimum) », « Maximum de la fourchette », « Devise », « Valable jusqu'au » (date minimale demain), « Principales garanties », « PDF facultatif » ; « Envoyer la proposition au visiteur » | « Proposition envoyée. Le visiteur est prévenu par e-mail et la voit dans son espace de suivi. » ; badge « Propositions actives : 1 / 10 » ; e-mail « Une proposition est disponible pour votre demande QR-… » ; statut du lead inchangé en Starter | C : scenario-core SC-06 |
| E-P6-03a | PROP | Broker | Champs vides ; minimum supérieur au maximum ; prime négative ; validité aujourd'hui ou passée | « Saisie refusée : message, prime ou fourchette, devise et date de validité future sont obligatoires. » ; aucune proposition créée | N |
| E-P6-03b | PROP | Broker | Message avec « contrat validé », « garanti à vie », « guaranteed » ; puis « garanties incluses » et « garanti » seul | Les trois premiers : « Envoi refusé : le texte contient une formulation interdite. » ; les expressions hors liste passent (comparaison insensible à la casse et aux accents, pluriel toléré) | N |
| E-P6-03c | PROP | Broker | PDF `note.txt` ou `gros.pdf` ; `eicar.pdf` | « Fichier refusé : PDF de 5 Mo au maximum uniquement. » ; « Envoi refusé : le fichier n'a pas passé l'antivirus. Il n'a pas été conservé. » | N |
| E-P6-03d | PROP | Broker | Envoyer 10 propositions actives puis une onzième ; « Retirer cette proposition » | « Limite de 10 propositions actives atteinte pour ce lead. » (409 `PROPOSAL_LIMIT_REACHED`, blocage préventif « 10 propositions actives au maximum : retirez-en une avant d'en envoyer une nouvelle. ») ; après retrait : « Proposition retirée. Elle n'est plus visible du visiteur ; vous pouvez en envoyer une nouvelle. » | N |
| E-P6-03e | PROP | Broker | Proposition dont la validité est dépassée (H11) | Statut « Expirée » ; ne compte plus parmi les actives ; côté visiteur la réponse est fermée (E-P6-05b) | N |
| E-P6-03f | PROP | Broker | Proposer sur un lead non accepté, clôturé, ou au consentement retiré | « Le lead doit être accepté avant toute proposition. » ; « Ce lead est clôturé : aucune proposition ne peut être envoyée. » ; « Le consentement du visiteur n'est plus actif : envoi refusé. » | P : forbidden-cases-pro SC-10-WD-4 (retrait) |
| E-P6-03g | PROP | Broker | Double clic sur « Envoyer la proposition au visiteur » ; XSS dans le message | Une seule proposition ; texte échappé côté visiteur et dans l'e-mail | N |
| P6-04 | V1 | Public | Rouvrir le lien de suivi | « Une proposition de courtier est disponible » ; « Propositions des courtiers » ; mention « Proposition indicative non contractuelle, à confirmer par le courtier » ; **aucun** vocabulaire « souscrire », « acheter », « payer » | C : scenario-core SC-07 |
| P6-05 | V1 | Public | « Je suis intéressé, rappelez-moi », créneau « demain entre 10 h et 12 h », « Envoyer ma réponse au courtier » | « Réponse transmise au courtier » ; côté courtier : statut « Réponse du visiteur », notification « Réponse du visiteur à votre proposition », statut CRM non modifié d'office | C : scenario-core SC-07 |
| E-P6-05a | V1 | Public | Choisir « Poser une question » sans texte ; question de 501 caractères ; créneau de 101 caractères | « Saisissez votre question avant de l'envoyer. » ; limites 500 et 100 caractères respectées ou refusées | N |
| E-P6-05b | V1 | Public | Répondre à une proposition expirée ou « Plus active » (réaffectation, clôture) | « La date de validité de cette proposition est dépassée : vous ne pouvez plus y répondre depuis cet espace. » ; « Cette proposition n'est plus active : vous ne pouvez plus y répondre depuis cet espace. » ; envoi forcé : 409 `PROPOSAL_NOT_RESPONDABLE` « Cette proposition ne peut plus recevoir de réponse (retirée, expirée ou plus active). Rechargez la page pour voir son état. » | N |
| E-P6-05c | V1 | Public | Rafales de réponses ; XSS dans la question | « Trop de réponses envoyées en peu de temps. Réessayez dans quelques minutes. » (10 par IP et par heure, 5 par proposition) ; question échappée côté courtier | N |

### 11.3 Messagerie, documents demandés (spec 062)

Pré-requis : SA ouvre `broker_visitor_messaging_enabled` (fermé par défaut, motif obligatoire, aucune ouverture en production avant l'avis juridique L-08).

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| P6-06 | PROP | Broker | Carte « Échanger avec le visiteur » : « Message au visiteur » plus pièce PDF, « Envoyer le message » | « Message envoyé. Le visiteur est prévenu par e-mail (sans le texte du message) et le voit dans son espace de suivi. » ; e-mail « Nouveau message de votre courtier pour votre demande QR-… » sans texte ni nom de fichier ; premier message courtier = première réponse visible (SLA) | C : recos-062-messaging MSG-01 (Starter), MSG-02 (Pro) |
| E-P6-06a | PROP | Broker | Message « contrat validé » (puis « guaranteed ») | « Envoi refusé : le texte contient une formulation interdite. Reformulez puis renvoyez. Expression(s) refusée(s) : « contrat valide ». » ; le brouillon reste dans la zone de saisie ; rien d'enregistré ni d'envoyé | C : recos-062-messaging MSG-03 |
| E-P6-06b | PROP | Broker | Message vide ; 2001 caractères ; message identique envoyé deux fois en moins de 5 minutes | « Saisie refusée : le message (2000 caractères au maximum) ou l'intitulé de la demande (120 caractères) est obligatoire. » ; « Message identique déjà envoyé il y a moins de 5 minutes : envoi ignoré. » | N |
| E-P6-06c | PROP | Broker | 4 pièces ; `note.txt` ; `gros.pdf` ; `eicar.pdf` ; nom de fichier contenant « garanti à vie » | « Fichier refusé : 3 fichiers au maximum, PDF, JPEG ou PNG de 5 Mo chacun. » ; EICAR : « Envoi refusé : un fichier n'a pas passé l'antivirus. Il n'a pas été conservé. » ; le nom du fichier passe aussi le filtre de formulations interdites | N |
| E-P6-06d | SA | Admin | Couper `broker_visitor_messaging_enabled` (motif obligatoire), puis le rétablir | Courtier : « La messagerie avec les visiteurs est temporairement désactivée par AssurMatch. » (409 `MESSAGING_DISABLED`), conversation en lecture seule ; visiteur : « La messagerie est suspendue pour le moment. Vous pouvez relire vos échanges, mais pas envoyer de nouveau message. » ; l'historique reste lisible | C : recos-062-messaging MSG-05 |
| P6-07 | V1 | Public | Section « Conversation avec votre courtier » : lire, télécharger la pièce, « Votre message » avec pièce, « Envoyer le message » | « Message envoyé. » ; accusé « Lu » côté courtier ; notification « Nouveau message d'un visiteur » ; `/notifications` : « Ouvrir la conversation » mène à `/leads/…#conversation` (Pro : `/crm/leads/…?tab=conversation`) | C : recos-062-messaging MSG-01 |
| E-P6-07a | V1 | Public | Pièce `gros.pdf` ; `note.txt` ; 4 fichiers ; `vide.pdf` ; `eicar.pdf` | « Le fichier « {nom} » dépasse 5 Mo. » ; « Le fichier « {nom} » n'est ni un PDF, ni un JPEG, ni un PNG. » ; « Vous pouvez joindre 3 fichiers au maximum. » ; « Le fichier « {nom} » est vide. » ; EICAR : « Une pièce jointe n'a pas passé l'analyse de sécurité. Retirez-la ou remplacez-la : votre message n'a pas été envoyé. » ; un fichier refusé annule tout l'envoi | N |
| E-P6-07b | V1 | Public | Message visiteur avec « contrat validé » ; message identique en moins de 5 minutes ; honeypot rempli | Le message du visiteur n'est **pas** filtré (H18) ; doublon : « Ce message vient déjà d'être envoyé. Patientez quelques minutes avant de le renvoyer. » ; honeypot : succès factice, rien d'écrit | N |
| E-P6-07c | V1 | Public | Écrire avant l'acceptation du lead ; lead clôturé ; lead réaffecté ; consentement retiré | Zone de saisie masquée : « Conversation en lecture seule » avec le motif (« Le courtier n'a pas encore pris en charge votre demande : vous pourrez lui écrire dès que ce sera le cas. », demande clôturée, confiée à un autre courtier, consentement retiré) | P : recos-062-data-reassign DR-12 (réaffectation) |
| E-P6-07d | V1 | Public | 31e message en une heure ; conversation de 300 messages | « Vous avez envoyé trop de messages en peu de temps. Réessayez plus tard. » ; « Cette conversation a atteint le nombre maximal de messages. » | N |
| P6-08 | PROP | Broker | « Demander un document » : « Document demandé » `Carte grise`, « Précision pour le visiteur », « À fournir avant le » ; « Demander le document au visiteur » | « Demande de document créée. Le visiteur est prévenu par e-mail et peut téléverser ses fichiers dans son espace de suivi. » ; e-mail « Des documents vous sont demandés pour votre demande QR-… » sans l'intitulé ; statut « Ouverte » | C : recos-062-messaging MSG-04 |
| E-P6-08a | V1 | Public | « Documents demandés » : téléverser `eicar.pdf`, puis `licence.pdf` | EICAR : « Un fichier n'a pas passé l'analyse de sécurité. Retirez-le ou remplacez-le : rien n'a été envoyé. » et la demande reste « À fournir » ; PDF sain : « Fournie » ; le courtier télécharge le fichier (audité) et reçoit « Document reçu d'un visiteur » | C : recos-062-messaging MSG-04 |
| E-P6-08b | PROP | Broker | Créer une 11e demande ouverte ; « Annuler cette demande » puis téléversement du visiteur | « Limite de 10 demandes de documents ouvertes atteinte pour ce lead. » ; statut « Annulée » ; visiteur : « Cette demande n'est plus ouverte : vos fichiers n'ont pas été envoyés. » | N |
| E-P6-08c | SYS | Mailpit | Lire tous les e-mails de messagerie, de documents demandés et de demandes de données | Aucun ne reprend le texte d'un message, un intitulé de document, un nom de fichier ou le détail d'une demande ; seul un pointeur vers l'espace de suivi | P : recos-062-messaging MSG-01, MSG-04 |

### 11.4 Cas de vie du lead : suspension, retrait de consentement, effacement, réaffectation

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| P6-09 | CA | Admin | « Suspendre » le courtier A avec un lead ouvert (dialogue « Le courtier n'est plus routé ; ses utilisateurs passent en consultation seule jusqu'à la réactivation. ») | Portail A : bandeau « Compte suspendu : consultation seule. Contactez AssurMatch. », écritures refusées 403 `PARTNER_SUSPENDED`, conversation « Compte suspendu : consultation seule. Contactez AssurMatch. » ; ses offres disparaissent du public ; aucun nouveau lead ; réactivation : retour au statut précédent après revérification des conditions | C : forbidden-cases SC-09e |
| E-P6-09a | CA | Admin | Courtier A résilié ; le propriétaire se reconnecte | Connexion refusée (401 « Account unavailable ») ; accès perdu pour tous ses utilisateurs ; leads plus routés | N |
| E-P6-09b | CA | Admin | Suspendre la licence de A ; licence qui expire sous 30 jours | Licence suspendue : A inéligible, offre retirée, consentement ne le nomme plus ; échéance sous 30 jours : alerte conformité et notification « Licence bientôt expirée » (courtier garde ses leads) | C : forbidden-cases-pro SC-10-LIC-1 à -4 |
| P6-10 | V1 | Public | « Retirer mon consentement » puis « Confirmer le retrait » | « Consentement retiré » : « Votre demande de devis est annulée et le courtier partenaire a été informé. » ; e-mail « Retrait de votre consentement confirmé (QR-…) » ; bandeau « Vous avez retiré votre consentement le … » ; propositions masquées | C : forbidden-cases-pro SC-10-WD-1, -2 |
| E-P6-10a | V1 | Public | Retirer deux fois ; jeton erroné | « Consentement déjà retiré » ; idempotent côté API ; un jeton erroné ne révèle rien | C : forbidden-cases-pro SC-10-WD-3 |
| E-P6-10b | PROP | Broker | Après le retrait, ouvrir le lead | Lead clôturé ; « Le visiteur a retiré son consentement : ses coordonnées sont masquées et ne doivent plus être utilisées. » ; actions et propositions bloquées ; notification reçue ; preuve de consentement « withdrawn » côté conformité | C : forbidden-cases-pro SC-10-WD-4, -5 |
| P6-11 | V1 | Public | « Mes données » : « Effacer mes données » avec précisions, « Déposer ma demande » | « Demande enregistrée. La référence de votre demande est DR-… » ; e-mail « Votre demande DR-… est bien reçue » ; rien n'est effacé | C : recos-062-data-reassign DR-02 |
| E-P6-11a | V1 | Public | Seconde demande d'effacement ouverte ; précisions de 1001 caractères | « Une demande de ce type est déjà en cours : DR-… » (409 `DATA_REQUEST_ALREADY_OPEN`) ; précisions refusées au-delà de 1000 | P : DR-03 (doublon) |
| E-P6-11b | CA, SU | Admin | `/compliance/data-requests` : « Prendre en charge », « Créer l'aperçu d'effacement » (case « J'ai compris : cette action ne crée qu'un aperçu, rien n'est effacé. »), « Clôturer comme traitée » ; « Rejeter la demande » sans note ; clôturer un effacement sans lot ; le support ouvre la demande | « Demande prise en charge… » ; aperçu créé, rien d'effacé ; clôture : e-mail pointeur sans note ; rejet sans note : « Une note interne est obligatoire pour rejeter une demande. » ; clôture sans lot : case de confirmation obligatoire ; support : lecture minimale, actions refusées « Action refusée : MFA vérifiée et rôle de conformité requis (refus audité). » | C : recos-062-data-reassign DR-04, -05, -06 |
| P6-12 | AP, SA | Admin | `/lead-assignments` : « Nouveau courtier partenaire (UUID) », motif, « Réaffecter » (lead de A vers B) | « Lead réaffecté (statut …). L'ancien courtier perd l'accès. » ; A : « Accès refusé » ; B repart d'une conversation vide ; visiteur : ancienne conversation « clôturée » en lecture seule, ses propositions « Plus active » ; documents demandés par A clos | C : recos-062-data-reassign DR-08 à DR-14 |
| E-P6-12a | CA, SA | Admin | Réaffecter au même courtier ; vers un courtier inéligible ; avec un motif de 7 caractères ; en tant que `compliance_admin` | Conflit `same_partner` ; « Partner not eligible: … » ; motif refusé ; `compliance_admin` : 403 (réservé à `admin_pays` et Super Admin, MFA requise) | N |
| E-P6-12b | CA | Admin | `/quote-requests/…` : « Afficher les échanges (consultation auditée) » ; même chose pour le support | Lecture seule de la conversation (audité) ; support : « Contenu masqué pour votre rôle (support) » | C : recos-062-data-reassign DR-14 (conformité) |

## 12. Phase 7 — Retour visiteur, clôture, avis, facturation

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| P7-01 | PROP | Broker | « Clôturer » : confirmation « Clôturer le lead », « Issue » Gagné, commentaire | Lead « Clôturé » ; le visiteur est prévenu (« Votre demande de devis QR-… est clôturée ») **sans** l'issue commerciale | C : scenario-core SC-08 |
| E-P7-01a | PROP | Broker | Clôturer sans issue ; commentaire de 501 caractères ; clôturer à nouveau | Issue obligatoire (« Gagné », « Perdu », « Sans suite ») ; 500 caractères au plus ; « Ce lead est clôturé: aucune action courtier n'est plus possible. » | N |
| E-P7-01b | PROP, V1 | Broker, Public | Écrire ou téléverser après clôture | Courtier : « Ce lead est clôturé : aucun message ni demande ne peut être envoyé. » ; visiteur : « Conversation en lecture seule » ; documents demandés fermés | N |
| P7-02 | V1 | Mailpit, Public | Ouvrir « Votre avis sur votre mise en relation avec le courtier » (`/avis/SF-…?token=`), note de 1 à 5, commentaire, « Envoyer mon avis » | « Merci pour votre avis / Votre réponse est enregistrée. » ; lien à usage unique | C : scenario-core SC-08 |
| E-P7-02a | V1 | Public | Envoyer sans note ; commentaire de 1001 caractères | « Choisissez une note de 1 à 5. » ; serveur : « Rating must be an integer between 1 and 5 » ; 1000 caractères au plus | N |
| E-P7-02b | V1 | Public | Rouvrir le lien après envoi ; jeton falsifié ou expiré (30 jours) ; référence inconnue ; second `POST` | Même écran « Ce questionnaire n'est plus disponible » (« Le lien est peut-être incomplet, a expiré ou a déjà été utilisé. ») ; second `POST` : confirmation précédente (`alreadySubmitted`), rien de modifié ; sans lien valide : aucune donnée de la demande | P : visitor-tracking (page sans lien valide) |
| E-P7-02c | V1, CA | Public, Admin | Note de 1 ou 2, ou case « Je souhaite signaler un problème avec le courtier partenaire » | Une alerte conformité est créée et visible côté admin | N |
| E-P7-02d | V1 | Public | `/desinscription?token=` : jeton absent, falsifié, valide | Absent ou mal formé : « Ce lien n'est pas valide » ; valide : « Confirmer la désinscription » puis « Désinscription enregistrée » ; falsifié refusé (HMAC) ; les e-mails de suivi de la demande continuent | N |
| P7-03 | SA (Finance Admin : 403 sur les tarifs et le recalcul, H-A) | Admin | `/billing` : onglet « Tarifs » (Starter CI, « Enregistrer le tarif »), « Recalculer les brouillons », « Émettre la facture », « Enregistrer le paiement » (virement) | Facture `CI-AAAA-NNNNNN` « payée » ; côté courtier `/billing` : « réglée », « Télécharger le PDF » ; « Facturation manuelle: aucun paiement en ligne, aucune prime d'assurance encaissée par AssurMatch. » | C : scenario-core SC-08 |
| E-P7-03a | FA | Admin | Émettre avec `billing_enabled` fermé ; brouillon vide ; mentions légales incomplètes | 422 (« billing_disabled ») ; 409 « Invoice conflict: empty_draft » ; hors local : 422 « Invoicing configuration incomplete: … » (en local, mentions imprimées « [A COMPLETER] ») | N |
| E-P7-03b | FA | Admin | Paiement supérieur au reste dû ; date future ; facture déjà payée ou annulée | 409 « Invoice conflict: amount_exceeds_balance », « payment_date_in_future », « invoice_already_paid », « invoice_cancelled » **[À CONFIRMER : texte affiché]** | N |
| E-P7-03c | FA | Admin | « Émettre l'avoir » sur une facture non réglée ; sur une facture réglée | Avoir `CI-AV-AAAA-NNNNNN` (annulation intégrale) ; facture réglée : refusé | P : recos-063 DSP-03 à DSP-05 (avoirs partiels des litiges) |
| E-P7-03d | CA, SU, AGT, FA | Admin, Broker | Ouvrir `/billing` avec un rôle sans droit ; sans MFA ; Finance Admin : enregistrer un tarif ou recalculer les brouillons (hypothèse H-A, **À valider** côté produit : comportement actuel figé par les tests, aucun élargissement de privilèges) | Admin : refus 403 (`BILLING_SCOPE_MISSING` sans périmètre de facturation) ; Finance Admin : 403 sur les tarifs et le recalcul ; « Vérification MFA requise avant cette action. » ; courtier agent : « Accès réservé » ; facture d'un autre courtier introuvable | N |
| E-P7-03e | PROP, FA | Broker, Admin | Demande de changement de plan (« Plan souhaité », « Justification (10 caractères au minimum) ») ; manager et agent ; décision admin | Propriétaire seul : « Envoyer la demande », « Annuler la demande » ; autres : « Action refusée : seul le propriétaire du cabinet peut demander un changement de plan. » ; acceptée : effet au prochain cycle, notification « Changement de plan accepte » | C : pro-06-plan-change-addons PLAN-01 à PLAN-04 |

## 13. Cas transversaux (sécurité, accès croisés, injection, accessibilité, responsive, langues)

| ID | Acteur | App | Action | Résultat attendu | Couv. |
|---|---|---|---|---|---|
| T-01 | CA | Admin | Après le parcours, `/compliance/audit-logs` : filtrer par « Action (préfixe) » `user.`, `partner_application.`, `partner.`, `offer.`, `feature_flag.`, `accreditation_document.`, `data_request.`, `routing.`, `billing.` | Chaque action sensible rejouée figure avec acteur, cible et résultat : `user.login_failed`, `user.mfa_failed`, `user.locked_after_failed_logins`, `partner_application.duplicate_ignored`, `partner.status_changed`, `offer.rejected`, `accreditation_document.quarantined`, `routing.reassigned`, `billing.invoice.issued`, etc. ; les refus sont audités (`*_refused`) | N |
| T-02 | PROP-B | Broker, API | Accès croisés courtier : URL et appels API d'un autre courtier pour `/leads/<id>`, `/offers/<id>`, pièces jointes, factures, membres d'équipe | Toujours « Accès refusé » (403) ou « introuvable » (404), jamais de donnée ; incident audité (`cross_tenant_access`) | P : forbidden-cases SC-09d (lead, coordonnées, proposition) ; offres, factures, pièces à ajouter |
| T-03 | V2 | Public, API | Accès croisés visiteur : jeton de V1 sur la référence de V2 ; référence de V2 sans jeton ; pièces jointes et documents d'un autre visiteur | 404 neutre `VISITOR_ACCESS_DENIED` « Quote status not available » ; aucune distinction entre inconnu, expiré, falsifié ; pièces : 404 neutre | P : recos-062-data-reassign DR-09 (ancien courtier), visitor-tracking (jeton altéré) |
| T-04 | SYS | Public, Broker, Admin | Charges XSS (`<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>`) dans : raison sociale, ville, nom commercial d'offre, description, marque du véhicule, prénom, message du courtier, question du visiteur, commentaire d'avis | Aucun `alert` ne s'exécute dans aucune des trois apps ni dans les e-mails ; aucun `dangerouslySetInnerHTML` dans les apps ; les valeurs s'affichent comme texte ; le CMS refuse les entrées contenant « < » | P : admin-cms CMS-04 (« < » refusé dans le CMS) ; le reste est N |
| T-05 | SYS | Public, Broker, Admin | Chaînes SQL (`'; DROP TABLE leads;--`, `' OR '1'='1`) dans : e-mail de `/login`, `/suivi`, filtres de `/leads`, recherche d'audit, champs de devis | Aucun 500 ; aucune fuite ; réponses identiques à une saisie banale ; données stockées telles quelles et rendues échappées | N |
| T-06 | SYS | API | Récapitulatif des limites de débit à vérifier : connexion (10 échecs par identifiant, 100 par IP, fenêtre 15 min : 429) ; candidature 3 par heure et par IP ; devis 5 par minute ; `/suivi` 5 par IP et 3 par référence et par heure ; suivi 60 consultations par IP et par heure ; retrait 5 par IP et par heure ; réponse à proposition 10 par IP et par heure ; messages visiteur 30 par IP et par heure ; demandes de données 5 par IP ; avis 10 par IP ; contact 5 par IP et par heure | Passé le seuil : 429 avec le message dédié de la fonction ; sous le seuil : aucun blocage ; compteurs indépendants | N |
| T-07 | SYS | Mailpit | Parcourir tous les e-mails du parcours | Aucun e-mail ni écran ne cite une garantie ou un prix comme contractuel ; aucun message contenant un jeton dans un champ visible autre que le lien ; aucun e-mail de messagerie ne reprend de contenu ; liens vers la bonne application (admin 3602, courtier 3603, public 3601) | P : recos-062-messaging MSG-01, MSG-04 |
| T-08 | V1 | Public | Balayage du vocabulaire visiteur (FR et EN) : espace de suivi, comparateur, devis, e-mails | Aucun « souscrire », « acheter », « payer », « contrat validé », « garantie acceptée », « garanti », « buy now », « subscribe », « guaranteed » ; le prix est toujours « indicatif » et « à confirmer par le courtier partenaire » | P : tests source `apps/public/tests/public-broker-messaging.spec.ts` (catalogues) ; parcours réel à faire |
| T-09 | SYS | Admin, Broker | Consigner tous les messages d'erreur d'authentification effectivement affichés (activation, MFA, jeton invalide, mot de passe courant) | Texte brut possible : `validation_error`, `api_400`, `api_429`, `api_500` (déduit du code, H13). Attendu : l'accès est refusé et aucune session n'est créée ; le texte exact est consigné pour décision produit | N |
| A11Y-01 | V1 | Public | Navigation au clavier depuis le haut de `/` | Premier `Tab` : lien « Aller au contenu principal » (cible `#contenu`) ; ordre de tabulation logique ; contour de focus visible (`:focus-visible`) sur liens, boutons, champs | N |
| A11Y-02 | CAND, V1 | Public | Candidature et devis entièrement au clavier : `Tab`, `Entrée` sur « Continuer », cases à cocher à la barre d'espace, cartes radio de formule | Le focus passe au titre de l'étape à chaque changement d'étape ; en erreur, il va au premier champ invalide ; chaque champ a son `<label>` ; erreurs en `role="alert"`, statuts en `role="status"` ; aucun piège clavier | N |
| A11Y-03 | V1 | Public | Espace de suivi au clavier et lecteur d'écran | Fil de conversation `role="log"` `aria-live="polite"` ; boutons « Retirer mon consentement » / « Confirmer le retrait » / « Annuler » atteignables ; téléversement sans souris | N |
| A11Y-04 | PROP, CA | Broker, Admin | Dialogues (« Convertir la candidature », « Refuser le document », « Clôturer le lead »), Kanban (Pro) au clavier | `Échap` ferme le dialogue, focus restitué ; confirmation à l'`Entrée` ; menu clavier du Kanban fonctionnel | P : pro-05 LOT3-02 (Kanban) |
| RSP-01 | V1 | Public | Largeur 375 px : `/`, comparateur, devis (4 étapes), confirmation, espace de suivi | Aucun défilement horizontal ; boutons et champs utilisables au doigt ; cartes d'offres en colonne ; texte non tronqué | N |
| RSP-02 | CAND | Public | Largeur 375 px : candidature (4 étapes, cartes de formule) | Idem ; les 4 étapes restent lisibles | N |
| RSP-03 | PROP | Broker | Largeur 375 px : `/leads`, fiche du lead, panneau de proposition, messagerie | Tableaux lisibles ou défilants dans leur conteneur ; formulaires utilisables | N |
| RSP-04 | CA | Admin | Largeur 375 px : `/offers`, fiche courtier, `/billing` | Pas de perte de fonction critique (ex. boutons de décision accessibles) ; consigner les écrans réservés au bureau | N |
| I18N-01 | V1 | Public | Parcours devis complet sur `/en/…` ; sélecteur de langue (en-tête et pied de page) depuis une page intérieure | Routes traduites (table 13.2) ; le sélecteur garde la page équivalente ; `<html lang>` suit la langue ; la détection par navigateur est coupée (seule l'URL décide) | N |
| I18N-02 | V1, CAND | Mailpit | E-mails reçus après un parcours EN | Objets EN (« Your quote request QR-… has been received », « Your AssurMatch partner application PA-… ») ; consentement EN publié (P0-03) | N |
| I18N-03 | V1 | Public | Messages venant de l'API sur `/en` | Restent en français (marqués `lang="fr"`) : phrase de confirmation du devis, noms d'offres. Consigner (H15) | N |
| I18N-04 | V1 | Public | Parité des catalogues FR et EN | Arbres de clés identiques, aucune valeur vide (`apps/public/tests/i18n-messages.spec.ts`) ; back-offices admin et courtier en français uniquement | P : tests source i18n-messages |

### 13.1 Matrice des cas limites par thème

| Thème | Cas |
|---|---|
| Champs vides ou invalides | E-P1-01a, E-P1-01b, E-P2-04a, E-P3-01a, E-P5-02a, E-P6-03a, E-P7-02a |
| Doublons (e-mail, licence, candidature, devis, demande de données) | E-P0-07a, E-P1-01g, E-P1-01h, E-P1-09a, E-P1-10f, E-P2-06a, E-P3-01i, E-P5-03d, E-P5-03e, E-P6-11a |
| Formats (téléphone, e-mail, prix, dates) | E-P1-01b à E-P1-01d, E-P2-04a, E-P2-05a, E-P3-01b à E-P3-01d, E-P5-02b, E-P5-02c, E-P6-03a |
| Fichiers (trop gros, mauvais type, EICAR) | E-P1-05a à E-P1-05c, E-P2-05b, E-P5-02g, E-P6-03c, E-P6-06c, E-P6-07a, E-P6-08a |
| Jetons (expirés, réutilisés, falsifiés) | E-P2-01d, E-P2-01e, E-P2-03b, E-P5-04a à E-P5-04c, E-P6-10a, E-P7-02b, E-P7-02d |
| MFA (mauvais code, rejeu, secours, verrouillage) | E-P0-01d à E-P0-01f, E-P2-02a à E-P2-02e |
| Session expirée (15 min) | E-P0-01g, E-P2-03a |
| Double soumission et concurrence | E-P1-02b, E-P1-03a, E-P1-10e, E-P2-04c, E-P3-01l, E-P3-02a, E-P3-02c, E-P4-01f, E-P5-03c, E-P6-02c, E-P6-03g |
| Consentement absent ou retiré | E-P5-03a, E-P5-03b, E-P6-03f, E-P6-07c, P6-10, E-P6-10a, E-P6-10b |
| Pays fermé, produit non publié | E-P0-06a à E-P0-06d, E-P1-01k, E-P4-03a, E-P4-03c, E-P5-01c, E-P5-01d |
| Courtier suspendu ou résilié en cours de route | P6-09, E-P6-09a, E-P6-09b, E-P4-01i, E-P1-10f |
| Offre rejetée ou suspendue | E-P4-01a, E-P4-01e, E-P4-01h, E-P4-03a |
| Aucun courtier disponible | E-P5-01e, E-P5-03i |
| Plusieurs courtiers (isolation des leads) | E-P6-01a, E-P6-01b, T-02, P6-12, E-P3-01m |
| Limite de propositions (10) et validité expirée | E-P6-03d, E-P6-03e, E-P6-05b |
| Formulations interdites | E-P0-03b, E-P0-04a, E-P3-01g, E-P3-01h, E-P6-03b, E-P6-06a, E-P6-07b, T-08 |
| Injection (XSS, SQL) | E-P1-01l, E-P2-04e, E-P3-01k, E-P5-02d, E-P6-01c, E-P6-03g, E-P6-05c, T-04, T-05 |
| Accès croisés | E-P3-01m, E-P6-01a, P6-12, T-02, T-03, E-P5-04b |
| Accessibilité clavier | A11Y-01 à A11Y-04 |
| Responsive 375 px | RSP-01 à RSP-04 |
| Langues FR et EN | E-P1-01n, E-P5-03j, I18N-01 à I18N-04 |
| Rôles et permissions | E-P0-02c, E-P0-07c, E-P0-07e, E-P1-02c, E-P1-10c, E-P2-04f, E-P2-06e, E-P3-01o, E-P4-01c, E-P6-01d, E-P7-03d |

### 13.2 Annexe : routes publiques FR et EN (relevées dans `apps/public/i18n/routing.ts`)

Le français est servi sans préfixe, l'anglais sous `/en` (`localePrefix: "as-needed"`).

| Page | FR | EN |
|---|---|---|
| Pays | `/pays/[code]` | `/en/countries/[code]` |
| Offres d'un produit | `/pays/[code]/produits/[productKey]/offres` | `/en/countries/[code]/products/[productKey]/offers` |
| Devis | `/pays/[code]/produits/[productKey]/devis` | `/en/countries/[code]/products/[productKey]/quote` |
| Comparer | `/comparer` | `/en/compare` |
| Détail d'une offre | `/offres/[offerId]` | `/en/offers/[offerId]` |
| Suivi d'une demande | `/demandes-de-devis/[publicReference]` | `/en/quote-requests/[publicReference]` |
| Renvoi du lien | `/suivi` | `/en/track` |
| Avis | `/avis/[publicReference]` | `/en/feedback/[publicReference]` |
| Désinscription | `/desinscription` | `/en/unsubscribe` |
| Candidature courtier | `/courtiers/candidature` | `/en/brokers/apply` |
| Confirmation de candidature | `/courtiers/candidature/confirmation` | `/en/brokers/apply/confirmation` |
| Contact, FAQ, guides, cookies | `/contact`, `/faq`, `/guides`, `/cookies` | identiques sous `/en` |

## 14. Hypothèses

Les questions métier non tranchées par le code ou les specs ont reçu l'option la plus prudente et la plus réversible. À valider par le propriétaire du produit.

| ID | Sujet | Hypothèse retenue dans ce scénario | Où dans le code ou le scénario |
|---|---|---|---|
| H1 | « Le visiteur se connecte » | Il n'y a pas de compte visiteur (décision D-3, spec 054) : il revient dans son espace par un lien magique reçu par e-mail (jeton de 32 octets, valable 30 jours, usage multiple, révocable) | `backend/src/modules/quote-requests/visitor-access.service.ts` |
| H2 | Règle « quatre yeux » sur les offres | Le code accepte `compliance_admin` ou `super_admin` et ne compare pas le validateur au créateur ; on utilise quand même un Compliance Admin distinct du Super Admin (comme l'ancien scénario), sans en faire une assertion bloquante | `backend/src/modules/offers/offer-admin.service.ts:102-104` ; seul le CMS impose les quatre yeux (`content-cms.service.ts:267`) |
| H3 | Complexité du mot de passe | 12 caractères et liste noire seulement ; `aaaaaaaaaaaa` est accepté. Le scénario consigne l'écart sans le tenir pour un défaut | `password-policy.service.ts:10-15` |
| H4 | Rejeu d'un code TOTP | Attendu prudent : un code déjà consommé est refusé. Le code ne mémorise pas le dernier compteur : le rejeu passe. Les cas E-P0-01e et E-P2-02b sont donc des « constats de sécurité » à ouvrir en défaut, pas des assertions vertes | `backend/src/modules/auth/mfa.service.ts:43` |
| H5 | Candidature en doublon | Même pays, même e-mail, même licence : réponse silencieuse avec la référence existante (conforme). Même licence avec un autre e-mail, ou même e-mail avec une autre licence : deux candidatures, la conformité tranche à l'examen | `partner-applications.module.ts:135-150` |
| H6 | Doublon de courtier et de propriétaire | E-mail déjà utilisé : refus neutre qui ne révèle pas l'existence du compte ; même RCCM dans le pays à la création directe : refus 409 ; la conversion d'une candidature ne contrôle pas le RCCM (la candidature n'en a pas) | `partner-admin.service.ts:243-246`, `broker-team.service.ts:92` |
| H7 | Prix à 0 | Le contrat accepte 0 (`nonnegative`) ; négatif refusé. Hypothèse prudente : documenter l'acceptation et laisser le produit trancher, la conformité refusant à la revue une offre à 0 | `packages/shared/contracts/offer-content.ts:42-43` |
| H8 | « contrat validé » dans une offre | La liste des offres compte 7 expressions à l'accent exact : « contrat validé » (accentué) n'est pas bloqué à la saisie, alors que la messagerie normalise les accents. Hypothèse prudente : la conformité refuse à la validation ; harmonisation à décider | `packages/shared/contracts/content-safety.ts:1-9` |
| H9 | Doublon de nom d'offre | Aucune unicité (clé publique suffixée `-2`, `-3`) ; accepté | `offer-lifecycle.service.ts:574-579` |
| H10 | Injection XSS et SQL dans les champs libres | Le serveur ne neutralise pas les entrées (`answers` non borné, stocké tel quel) : l'attendu est « stocké tel quel, jamais exécuté, rendu échappé, aucun 500 ». La longueur d'`answers` n'étant pas bornée, E-P5-02e consigne la taille acceptée | `packages/shared/contracts/quote.contracts.ts` |
| H11 | Proposition expirée et lien expiré | La validité minimale est demain et le lien dure 30 jours : l'expiration ne se teste que sur pile jetable (horloge avancée ou mise à jour de la date en base de test), jamais sur une base partagée | E-P6-03e, E-P6-05b, E-P5-04a |
| H12 | Session de 15 minutes | Testée par attente réelle une fois, puis par suppression du cookie (`assurmatch_admin_token`, `assurmatch_broker_token`) pour les autres cas ; pas de renouvellement automatique | `AUTH_JWT_TTL_MINUTES`, `middleware.ts` |
| H13 | Messages d'erreur d'authentification bruts | Le code déduit un affichage brut (`validation_error`, `api_400`, `api_500`) pour jeton invalide, mauvais code MFA et mot de passe refusé ; le scénario attend « refus, aucune session » et consigne le texte réel sans l'exiger | `auth-flow-actions.ts:27-56`, `error-response.filter.ts:119-131` |
| H14 | « Aucun courtier disponible » | Obtenu par un produit sans courtier autorisé (Voyage) ou par la suspension du courtier A ; le visiteur n'a aucune promesse de rappel | `quote-submission.service.ts:490-494` |
| H15 | Langue des messages serveur sur `/en` | Les phrases venant de l'API restent en français ; accepté, à consigner | `ui/backend-text.tsx:12` |
| H16 | Doublon de devis sous 30 jours | Aucun second lead ; l'écran affiche probablement la référence « duplicate » : traité comme anomalie d'affichage probable à confirmer, pas comme comportement voulu | `quote-submission.service.ts:1160-1167` |
| H17 | Bandeau de cookies | Absent : le site déclare ne poser aucun cookie ni stockage local (`visit-beacon.tsx:11`) ; aucun cas « cookies » | `apps/public/app/components/site/visit-beacon.tsx` |
| H18 | Message du visiteur avec formulation interdite | Pas de filtre côté visiteur (seuls le courtier et ses noms de fichiers sont filtrés) : le message du visiteur passe | `lead-messaging.service.ts:196-200` |
| H19 | Mineur, âge, date de naissance | Aucune règle dans le devis : hors périmètre, aucun cas | recherche dans `quote-forms`, `prospects` |
| H20 | Limite de sièges selon le plan | Aucune limite trouvée dans `broker-self-service`, `billing`, `enterprise` : aucun cas | — |
| H21 | Responsive 375 px et accessibilité | Aucun test automatique à 375 px dans `apps/public/tests` : cas manuels ou à écrire ; l'accessibilité est vérifiée par relevé statique et par parcours clavier | `apps/public/app/styles/base.css` |
| H22 | Avis et facturation | Flags sensibles : ouverts uniquement par `scripts/ops/apply-flag-policy.ts` avec référence et motif ; délai de l'enquête mis à 0 sur pile de test (24 h par défaut) | `docs/scenarios/e2e-admin-courtier-devis.md` (note finale), `satisfaction-survey-trigger.service.ts:31-42` |
| H23 | Pile et données | Le scénario manuel tourne sur une pile locale vierge dédiée ; les cas de durée et de limites de débit ne se jouent jamais sur la pile partagée ou de préproduction, et les limites de débit en dernier (elles bloquent l'IP une heure) | — |
| H24 | Pays autorisé à la candidature | `internal` n'est pas bloqué par le test de statut mais l'annuaire des pays ouverts aux candidatures filtre sur `public` ou `pilot` et sur le flag d'inscription : le pays CI est passé `pilot` avant la candidature | `runtime-http-wiring.module.ts:1068` |

## 15. Couverture existante et nouveau

### 15.1 Spécifications Playwright existantes (ne pas réécrire)

| Fichier (`tests/e2e/`) | Identifiants | Cas de ce document couverts |
|---|---|---|
| `scenario-core.spec.ts` | SC-01a à SC-08 | P0-01 à P0-07 (nominaux), P1-01 à P1-10, P2-01, P2-02, P2-04 à P2-06, P3-01, P3-02, P4-01, P4-02, P4-03, P5-01 à P5-04, P6-01 à P6-05, P7-01 à P7-03 |
| `forbidden-cases.spec.ts` | SC-09a à SC-09e | E-P5-01c, E-P5-01d, E-P5-03a, E-P6-01a, P6-09 |
| `forbidden-cases-pro.spec.ts` | SC-10-LIC-1 à -4, SC-10-WD-1 à -5 | E-P6-09b, P6-10, E-P6-10a, E-P6-10b, partie de E-P6-03f |
| `recos-062-messaging.spec.ts` | MSG-00 à MSG-05 | P6-06, P6-07, P6-08, E-P6-06a, E-P6-06d, E-P6-08a |
| `recos-062-data-reassign.spec.ts` | DR-01 à DR-14 | P6-11, E-P6-11b, P6-12, E-P6-12b, partie de E-P6-11a, E-P6-07c |
| `recos-063-mfa-disputes.spec.ts` | MFA-01 à -04, DSP-00 à -05 | P2-03, E-P2-02e, E-P6-02b, partie de E-P7-03c |
| `recos-066-shared-phone.spec.ts` | F1-01 à F1-03 | E-P5-03e |
| `visitor-gaps-01-quote.spec.ts` | VG-00 à VG-99 | P5-02 (nom complet), E-P5-03h, partie de E-P5-02g, E-P6-01b |
| `visitor-gaps-03-catalog.spec.ts` | VGC-01 à VGC-03 | P5-01 (mentions), E-P4-03b |
| `visitor-tracking.spec.ts` | 3 tests (lien magique, renvoi, avis sans lien) | E-P5-04a, E-P5-04c, partie de E-P7-02b |
| `senegal-opening.spec.ts` | SN-01 à SN-09 | E-P4-02a, E-P0-06b, E-P5-01c, partie de P0-05 |
| `pro-02-crm.spec.ts`, `pro-03-roles.spec.ts`, `pro-05-crm-dashboard-kanban.spec.ts`, `pro-06-plan-change-addons.spec.ts`, `enterprise-agencies-sla.spec.ts`, `recos-064-wired-capabilities.spec.ts` | PRO-CRM, PRO-ROLES, LOT3, PLAN, ENT, W064 | E-P6-01d, E-P7-03e, A11Y-04 (Kanban) ; plans Pro et Enterprise hors périmètre de ce scénario Starter |
| `admin-cms.spec.ts`, `admin-channels.spec.ts`, `admin-ai-integrations.spec.ts`, `pro-04-ai-disabled.spec.ts`, `visitor-gaps-02-ai-closed.spec.ts`, `ops-health.spec.ts` | CMS, CH, AI, PRO-AI, VGA, SC-10a/b | Hors parcours courtier ; renvoi pour E-P0-02b (flags IA et canaux) et T-04 (CMS) |

Aides réutilisables : `tests/e2e/support/world.ts` (`provisionBroker`, `activateAccount`), `partners.ts` (`onboardBrokerDirect`), `activation-prerequisites.ts`, `backoffice.ts`, `totp.ts`, `mailpit.ts`, `files.ts` (`pdfFile`, `eicarFile`), `quote-form.ts`, `visitor-gaps.ts` (appels API publics), `journey-state.ts`.

### 15.2 Bilan

Ce document compte **267 cas** : 47 cas nominaux (`P<phase>-<nn>`), 199 cas limites (`E-P…`) et 21 cas transversaux (`T-`, `A11Y-`, `RSP-`, `I18N-`). Ce chiffre dépasse la fourchette de 80 à 150 cas initialement visée ; le sous-ensemble prioritaire de la section 15.4 (environ 140 cas) la respecte.

| Couverture | Nombre | Lecture |
|---|---|---|
| `C` : déjà couvert par Playwright | 69 | Renvoi vers le fichier, rien à écrire |
| `P` : couvert en partie | 27 | Écrire seulement ce que la colonne « Couv. » liste comme manquant |
| `N` : nouveau | 171 | À écrire (voir 15.3 pour l'ordre) |

Les cas nominaux sont couverts à plus de 90 % par `scenario-core.spec.ts` et les specs `forbidden-cases*`, `recos-062-*` et `recos-063-*` ; l'essentiel du « nouveau » est donc constitué de cas limites (validations, jetons, MFA, fichiers, injection, limites de débit, accessibilité, responsive, anglais).

### 15.3 À écrire en priorité (cas `N` à forte valeur)

1. Authentification (phases 0 et 2) : jetons expirés, réutilisés, falsifiés ; verrouillage après 5 échecs ; session de 15 minutes ; rejeu TOTP (constat).
2. Conformité de l'onboarding (phase 1) : refus d'activation avec conditions manquantes, documents refusés (type, taille, EICAR, CSRF), doublon de candidature, conversion déjà décidée.
3. Validation des offres (phases 3 et 4) : prix min supérieur au max, dates, garanties vides, formulation interdite, refus et suspension avec notifications.
4. Visiteur (phase 5) : validations de formulaire, téléphone par pays, doublon à 30 jours, « aucun courtier disponible », accès croisés par jeton.
5. Proposition (phase 6) : limite de 10, formulations interdites, validité, PDF refusé.
6. Transversaux : injection (XSS, SQL, CSV), limites de débit, accessibilité clavier, 375 px, anglais.

### 15.4 Sous-ensemble prioritaire (parcours minimal, environ 140 cas)

Tous les cas nominaux (`P0-01` à `P7-03`), plus :

- Phase 0 : E-P0-01a, E-P0-01d, E-P0-01e, E-P0-01g, E-P0-02b, E-P0-03a, E-P0-06a, E-P0-06b, E-P0-07a, E-P0-07c.
- Phase 1 : E-P1-01a, E-P1-01c, E-P1-01d, E-P1-01e, E-P1-01g, E-P1-01k, E-P1-02b, E-P1-03a, E-P1-05a, E-P1-05b, E-P1-05c, E-P1-05e, E-P1-06a, E-P1-07a, E-P1-08a, E-P1-09a, E-P1-10a, E-P1-10b, E-P1-10c, E-P1-10d.
- Phase 2 : E-P2-01d, E-P2-01e, E-P2-02a, E-P2-02c, E-P2-03a, E-P2-04a, E-P2-05a, E-P2-06a.
- Phases 3 et 4 : E-P3-01b, E-P3-01d, E-P3-01f, E-P3-01g, E-P3-01h, E-P3-01m, E-P3-02a, E-P4-01a, E-P4-01c, E-P4-01d, E-P4-01e, E-P4-01g, E-P4-03a.
- Phase 5 : E-P5-01b, E-P5-02a, E-P5-02b, E-P5-03a, E-P5-03c, E-P5-03d, E-P5-03i, E-P5-04a, E-P5-04b, E-P5-04c.
- Phase 6 : E-P6-01a, E-P6-02a, E-P6-03a, E-P6-03b, E-P6-03d, E-P6-03e, E-P6-05b, E-P6-06a, E-P6-07a, E-P6-09a, E-P6-11a, E-P6-12a.
- Phase 7 : E-P7-01a, E-P7-02b, E-P7-03a, E-P7-03b.
- Transversaux : T-01 à T-05, T-09, A11Y-01, A11Y-02, RSP-01, I18N-01.

## 16. Constats à consigner à l'exécution

### 16.1 Écarts entre l'ancien scénario (`e2e-admin-courtier-devis.md`) et le code

- Étapes 4, 5 et 18 : l'ouverture d'un pays exige aussi une règle de routage, une règle de scoring, les documents requis, l'avertissement légal FR et EN, les attestations pays et produit, et un courtier actif public (section 2 ci-dessus). Le courtier doit donc être « Actif public » **avant** le passage de CI en `public`.
- Étape 11 : `/company` n'a pas de champ « présentation » ; les champs sont « E-mail principal », « WhatsApp principal », « Ville », contacts administratif et commercial, « Assureurs partenaires ».
- Étape 14 : « Flexibilité de paiement » s'affiche « Fractionnement du paiement » ; prix « Prime minimale » et « Prime maximale ».
- Étape 16 : le Compliance Admin distinct n'est pas imposé par le code (H2). Il est créé par le Super Admin (le `compliance_admin` ne crée pas d'utilisateur).
- Étapes 23 et suivantes : le bouton de refus s'appelle « Rejeter avec motif » (et « Contester avec motif »), pas « Refuser ».
- Étape 25 : champs « Prime indicative (ou minimum) » et « Maximum de la fourchette ».
- Étapes 28b et 28f : boutons « Envoyer le message » et « Demander le document au visiteur » ; cartes « Échanger avec le visiteur » et « Documents demandés au visiteur ».
- Étape 28 : l'envoi d'une proposition fait passer l'assignation en `contacted` ; en CRM le statut passe à `devis_envoye`, en Starter il reste « Accepté ». Seule la réponse du visiteur ne change jamais le statut.
- Étape 10 : le jeton d'activation expire après 30 minutes.
- Étape 22 : le consentement ne nomme le courtier que si le devis est demandé depuis une offre (`?offerId=`).
- Étape 28m : le contenu des échanges se charge via « Afficher les échanges (consultation auditée) ».

### 16.2 Comportements suspects à qualifier

- Rejeu TOTP accepté (H4).
- Activation avec mot de passe refusé : texte brut `api_500` / `validation_error` plutôt qu'une phrase (H13) ; « Account suspended » probablement en 500.
- Avis « Compte verrouillé » de l'écran de connexion jamais émis par l'API.
- Incohérence de longueur de motif : champ `minLength=5` dans `/users/[userId]`, API à 8.
- Aucune protection « dernier super admin » ni « ne pas se suspendre soi-même » trouvée côté admin ; un `admin_pays` ou `compliance_admin` peut attribuer le rôle `super_admin` via « Mettre à jour les rôles » (risque d'escalade à confirmer).
- Doublon de devis : référence « duplicate » probable à l'écran (H16).
- Liste des formulations interdites des offres plus étroite que celle de la messagerie (H8).
- Paramètres non bornés du devis (`answers`, H10).
- Message de confirmation du devis non traduit sur `/en` (H15).

### 16.3 Points à vérifier à l'œil (non couverts par des assertions)

- Aucun e-mail ni écran ne cite une garantie ou un prix comme contractuel.
- Rien de personnel du visiteur dans l'URL (le jeton seul est autorisé) ni dans les journaux.
- Aucun e-mail de messagerie, de documents demandés ou de demande de données ne reprend de contenu saisi.
- Les trois applications ne partagent aucun cookie.

### 16.4 Résultat de l'exécution

- Scénario nominal (`scenario-core.spec.ts`) : 12/12 verts.
- Cas limites : les 12 specs `edge-p0-p1-*`, `edge-p2-p4-*` et `edge-p5-p7-*` ont été rejouées sur une pile reconstruite ; plus aucun `test.fail`. Les ~60 anomalies confirmées ont été corrigées, par thème :
  - authentification : jetons d'activation et de réinitialisation à usage unique, rejeu TOTP, messages d'erreur lisibles (identifiants invalides, compte suspendu, politique de mot de passe), expiration de session ;
  - rôles et comptes : fuite de secrets par `GET /admin/users`, escalade de rôle, auto-actions (suspension, retrait, suppression de soi), dernier Super Admin, e-mail déjà utilisé, périmètre pays de l'Admin Pays ;
  - contenu et conformité réglementaire : formulations interdites (offres, consentements, formulaires de devis, assureurs), masquage des offres publiées non conformes, XSS stocké (JSON-LD), feature flag IA sensible ;
  - devis et leads : transitions de statut (rejet, acceptation idempotente), doublon de message courtier, doublon de devis, honeypot, produit inconnu, champs obligatoires et bornes, avis visiteur ;
  - facturation : refus par périmètre (`BILLING_SCOPE_MISSING`), bandeau accentué ; Finance Admin inchangé (H-A) ;
  - interface : listes déroulantes non présélectionnées, validité de proposition à partir de demain, débordement à 375 px, libellé « Fichier refusé ».
- Cas non exécutés (le suivi indique « skips justifiés » ; motifs détaillés connus pour une partie seulement) : limites de débit (E-P0-01c, E-P1-01j, T-06 : elles bloquent l'IP, à rejouer sur pile jetable) ; SEC-LAST-1 et E-P1-03b (à rejouer sur pile jetable) ; E-P2-06c' ; E-P5-02g (flag d'upload fermé) ; E-P7-03a `billing_disabled` ; T-06 et T-09 ; cas d'horloge (expiration à 30 jours). Motif précis à compléter pour E-P2-06c', `billing_disabled`, T-09.
- Risques résiduels connus :
  - course sur les codes de secours MFA (`markMfaVerified` réécrit encore le tableau) ;
  - verrou d'acceptation des leads en mémoire (mono-instance) ;
  - `LAST_SUPER_ADMIN` non transactionnel ;
  - CMS et mentions légales : ancien filtre de formulations, plus large ;
  - `bootstrap-super-admin` imprime le jeton (commande d'exploitation) ;
  - `PATCH` générique du statut CRM sans contrôle de transition ;
  - message `FORBIDDEN_WORDING` en anglais côté CMS.
