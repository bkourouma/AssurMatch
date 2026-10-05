# Research: 050 — Administration du catalogue, des consentements et de l'activation

Constats de code (2026-10-02) et décisions de conception. Chaque décision indique ce qui a été choisi, pourquoi, et les alternatives écartées.

## Constats

| # | Constat | Preuve |
|---|---|---|
| C1 | Les contrôleurs de domaine pays, produits, régimes et textes de consentement existent mais ne sont pas câblés en HTTP | `countries/admin-countries.controller.ts`, `products/admin-products.controller.ts`, `regulatory-regimes/regulatory-regimes.controller.ts`, `consent/admin-consent-texts.controller.ts` ; aucune entrée dans `http-wiring/runtime-http-wiring.module.ts` |
| C2 | Deux systèmes de flags coexistent : le JSON `Country.flags` / `Product.flags` (seul lu par le parcours public) et la table `FeatureFlag` à portée (seulement lue pour `product_sensitive_data_enabled`). Ils ne sont pas synchronisés | `assurmatch-runtime.ts` l.230 et l.532-548 ; `public-journey-flag-policy.ts` |
| C3 | `ConsentText` ne conserve que `contentHash`, fourni par l'appelant ; aucun contenu n'est stocké, et le site public affiche le libellé fixe `QuoteForm.consentLabel` | `schema.prisma` l.719 ; `compliance.contracts.ts` l.4 ; `apps/public/app/components/quote-form.tsx` l.256-259 |
| C4 | L'adaptateur d'exécution force `purpose: "lead_transmission"` et supprime la langue des textes passés au service des formulaires : la vérification de finalité à la publication est inopérante | `assurmatch-runtime.ts` l.219-232 |
| C5 | La publication d'un formulaire ne vérifie ni la langue, ni le pays, ni le produit du texte de consentement. Elle retire déjà la version précédente (`publishExclusively`) | `quote-form-definition.service.ts` l.108-126, l.214-230 |
| C6 | `publicForm` retombe sur un formulaire publié **dans n'importe quelle langue**. Le site public n'envoie jamais la langue, et la soumission compare le consentement au formulaire FR | `quote-form-definition.service.ts` l.145-196 ; `public-api.ts` l.236 ; `quote-submission.service.ts` l.143-156 |
| C7 | `QuoteRequest` n'a pas de langue | `schema.prisma` l.968-994 |
| C8 | Validation du téléphone : longueur 6-32 côté contrat ; normalisation E.164 générique, avec une seule règle locale codée en dur pour la CI | `quote.contracts.ts` l.262-266 ; `prospect-identity.service.ts` l.29-34 |
| C9 | Régimes réglementaires uniquement en mémoire, sans mise à jour, alors que le modèle Prisma existe | `regulatory-regimes.module.ts` |
| C10 | `associateCountry` (Prisma) crée la liaison en statut `public` avec des flags vides, sans vérifier que le pays existe ; il n'existe pas de dissociation | `products.repository.ts` l.94-101 |
| C11 | Le seed de référence ne charge ni `consent-templates.json` ni les liaisons pays-produit, et **réécrit les flags pays et produit à chaque exécution** : le relancer refermerait des pays ouverts | `scripts/preprod/seed-reference.ts` l.105-151 |
| C12 | La checklist d'activation existe (sections global, pays, produit, préparation au devis, partenaires, offres) et refuse déjà les rôles non autorisés | `activation-checklist.service.ts` |
| C13 | Les messages d'erreur déterminent le statut HTTP par expressions régulières (`error-response.filter.ts`). Une `ZodError` levée par un service ou une contrainte d'unicité Prisma donne une 500 | `common/filters/error-response.filter.ts` l.62-74 |
| C14 | Le seul `support_admin` n'a aucune permission `countries:*`, `products:*` ni `consent:*` dans la matrice RBAC | `packages/shared/rbac/assurmatch-role-matrix.ts` |

## Décisions

### R1 — Source de vérité des flags pays et produit
- **Decision**: Le JSON de la fiche reste la source lue par le parcours public : `Country.flags`, `Product.flags`, et désormais `CountryProduct.flags`. Chaque bascule passe par un nouveau `CatalogFlagService`, qui (1) vérifie l'allowlist et les conditions, (2) écrit le JSON, (3) enregistre la valeur et l'historique dans `FeatureFlag` / `FeatureFlagHistory` via `featureFlags.service.setFlag`, et (4) audite. `scopeType` vaut `country` (scopeId = countryId) ou `product` (scopeId = productId pour le flag global du produit, `productId@countryId` pour la liaison).
- **Rationale**: Le parcours public, les offres et la checklist lisent déjà le JSON : en changer la lecture élargirait la spec et le risque de régression. La table apporte l'historique exigé par FR-003 et le principe VI.
- **Alternatives considered**: Basculer toute la lecture publique sur la table `FeatureFlag` (trop large, touche spec 008/045). Historique dans un champ JSON (pas d'historique requêtable, en doublon de `FeatureFlagHistory`).

### R2 — Flags produit par pays
- **Decision**: Flag effectif d'un produit dans un pays = `Product.flags[k]` **et** `CountryProduct.flags[k] ?? true`. Une liaison créée par le nouvel écran admin écrit explicitement tous les flags à `false` (sauf `product_manual_review_required: true`) et le statut `internal`. Les liaisons existantes sans flags (seed démo, tests) héritent du produit : compatibilité ascendante.
- **Rationale**: Permet d'ouvrir CI × Voyage sans ouvrir SN × Voyage (US2), sans casser les données existantes.
- **Alternatives considered**: Copier les flags produit dans chaque liaison au déploiement (migration de données inutile) ; flags par pays seulement (perd la désactivation globale d'un produit).

### R3 — Allowlist des flags modifiables depuis le catalogue
- **Decision**: Seuls ces flags sont modifiables. Pays : `country_public_enabled`, `country_waitlist_enabled`, `country_quote_enabled`, `country_comparison_enabled`, `country_broker_onboarding_enabled`. Produit et liaison : `product_public_enabled`, `product_quote_enabled`, `product_comparison_enabled`, `product_document_upload_enabled`, `product_manual_review_required`. Tout autre flag (`country_ai_enabled`, `product_ai_*`, `product_sensitive_data_enabled`) est refusé avec le motif « flag sensible : procédure de conformité ».
- **Rationale**: `isSensitiveFeatureFlagKey` ne reconnaît pas `country_ai_enabled` ni `product_ai_*` comme sensibles. Une allowlist explicite est plus sûre qu'un filtre d'exclusion (FR-027).

### R4 — Conditions d'activation
- **Decision**: Une **désactivation** n'a jamais de condition (FR-005). Pour une **activation** :
  - **`country_public_enabled`, ou statut pays `public`** : réservé à `compliance_admin` et `super_admin`. Exige que la checklist du pays (pays, produits liés, préparation au devis, au moins un partenaire actif et licencié, au moins une offre publiable) n'ait **aucun contrôle bloquant**, en ignorant les contrôles qui portent sur le flag ou le statut en cours de modification. La checklist reçoit un contrôle pays `country_active_licensed_partner` s'il n'existe pas.
  - **`country_quote_enabled`** : au moins une liaison du pays a un formulaire publié.
  - **`product_quote_enabled` sur une liaison** : formulaire publié pour ce pays × produit (FR-008).
  - **`product_public_enabled` sur une liaison** : texte `lead_transmission` publié pour ce pays et ce produit, ou pour ce pays sans produit (FR-008).
  - **Désactivation de `product_manual_review_required`** pour un produit de sensibilité `sensitive` ou `highly_sensitive` : réservée à `compliance_admin` ou `super_admin` (FR-009).
- **Rationale**: Reprend la checklist constitutionnelle « avant activation d'un pays ou d'un produit ». La réutilisation de `activationChecklist.service.read` évite une seconde implémentation des règles.
- **Alternatives considered**: Recoder les conditions dans le service catalogue (duplication, risque de divergence) ; bloquer seulement côté interface (contournable).

### R5 — Contenu et empreinte des textes de consentement
- **Decision**: Nouvelle colonne `ConsentText.content TEXT NULL` et `retiredAt`. À la création par l'admin, `content` est obligatoire, et `contentHash = sha256(contenu normalisé : fins de ligne LF, espaces de bord retirés)`, calculé par le serveur. Le contrat admin n'accepte plus d'empreinte fournie par l'appelant. `publishText` refuse un texte sans contenu, ou dont l'empreinte ne correspond pas au contenu. Le domaine accepte encore une empreinte fournie **sans** contenu pour les seeds de test existants, mais un tel texte ne peut pas être publié par la route HTTP.
- **Variables** : `{{brokerName}}`, `{{countryName}}`, `{{productName}}`, `{{contactFields}}`. L'empreinte porte sur le **modèle** (variables non résolues), seul objet versionné. La résolution est faite par le serveur au moment de servir le formulaire. Tant que le courtier n'est pas connu au moment du consentement, `{{brokerName}}` est rendu par la formule localisée « le courtier partenaire agréé auquel votre demande sera attribuée » (« the licensed partner broker your request will be assigned to »). La spec 052 (offre choisie) et la spec 054 (courtier nommé) affineront cette résolution.
- **Règles de publication (FR-012)** : aucune formulation interdite (`findForbiddenWording`). Pour `lead_transmission`, le contenu doit contenir `{{brokerName}}` et le mot « AssurMatch », qui rappelle le rôle technique.
- **Rationale**: La preuve opposable (principe VI) exige de savoir quel texte a été montré. Une empreinte fournie par l'appelant ne prouve rien.

### R6 — Langue du formulaire et de la demande
- **Decision**: Le site public envoie `language` (la locale de la page) à `GET …/quote-form`. Le service ne retombe plus sur une autre langue : s'il n'existe pas de formulaire publié dans la langue demandée, la route répond `404` avec le code `QUOTE_FORM_LANGUAGE_UNAVAILABLE` et `availableLanguages`, et le site affiche un message avec un lien vers la langue disponible (FR-024). `quoteRequestCreateSchema` accepte `language` (défaut `fr`). La soumission vérifie le consentement contre le formulaire de cette langue, et `QuoteRequest.language` est stocké.
- **Publication (FR-020)** : le texte référencé doit être publié, de finalité `lead_transmission`, de la **même langue**, du **même pays**, et du même produit ou sans produit. L'adaptateur d'exécution transmet la vraie finalité, la langue, le pays, le produit et le contenu (corrige C4).

### R7 — Champs génériques
- **Decision**: `create` ajoute les champs génériques absents (comparaison sur la clé), libellés dans la langue du formulaire :
  - `city` : text, requis, personnel ;
  - `contact_preference` : select phone, email, whatsapp, requis ;
  - `desired_timing` : select immediate, within_month, within_quarter, facultatif ;
  - `budget` : number, facultatif ;
  - `preferred_language` : select fr, en, facultatif ;
  - `source` : select search, social, word_of_mouth, partner, other, facultatif.

  Nom, e-mail et téléphone restent des champs de contact du formulaire, hors définition. Une option `includeGenericFields: false` est réservée aux tests unitaires existants (défaut `true`).
- **Rationale**: Satisfait FR-015 sans casser les formulaires du seed démo, qui définissent déjà `budget`.

### R8 — Téléphone par pays
- **Decision**: Nouvelles colonnes `Country.phoneDialCode String?` (par exemple `+225`) et `Country.phoneNationalLengths Int[]` (par exemple `[10]`). `ProspectIdentityService.normalize` reçoit la règle du pays :
  - accepté : `+<indicatif><n chiffres>`, ou `<n chiffres>` national, avec n dans les longueurs admises, normalisé en `+<indicatif><national>` ;
  - refusé : tout le reste, avec « Phone is invalid for country ».

  Sans règle (pays de test en mémoire), l'ancien comportement s'applique. La route publique du formulaire renvoie `phoneRule { dialCode, nationalLengths }`, utilisée pour l'aide et l'attribut `pattern`.
- **Valeurs de départ (seed)** : CI `+225` et `[10]` ; SN `+221` et `[9]`. Elles restent modifiables par l'admin.

### R9 — Régimes persistés
- **Decision**: `RegulatoryRegimesRepository` (mémoire pour les tests, Prisma à l'exécution), service asynchrone avec `create`, `update`, `retire` et `list`. Le retrait est refusé si un pays référence le régime (« Regulatory regime conflict: referenced by country XX »). `countries.update` vérifie que le régime existe et n'est pas retiré.

### R10 — Concurrence (FR-028)
- **Decision**: Les PATCH sur pays, produit et régime acceptent `expectedUpdatedAt` (ISO). S'il diffère de `updatedAt`, la requête est refusée avec « Catalog update conflict » (409). Le champ est facultatif dans le contrat, mais toujours envoyé par l'interface admin.

### R11 — Erreurs HTTP
- **Decision**: Les nouveaux contrôleurs valident leurs entrées par `parseHttpInput` (400). Les refus métier lèvent des exceptions Nest explicites (`ForbiddenException`, `ConflictException`, `UnprocessableEntityException` avec `{ code, message, blockers[] }`), au lieu de compter sur les expressions régulières du filtre. Les erreurs d'unicité Prisma sont converties en `ConflictException`.

### R12 — RBAC
- **Decision**: On réutilise la matrice existante sans l'élargir :
  - `countries:*` et `products:*` : `super_admin`, `admin_pays` (limité à son périmètre pays via `RbacGuard.assert(..., { countryId })`) ;
  - `consent:*` : `compliance_admin`, `super_admin` ;
  - activation publique : `compliance_admin` et `super_admin` uniquement, contrôlé par rôle explicite ;
  - **`support_admin`** n'a aucun accès en lecture au catalogue dans la matrice actuelle. La spec ne demandait que l'absence d'écriture : nous gardons la matrice telle quelle, pour ne pas élargir l'accès dans cette spec.

  Classe de route protégée : authentification et MFA obligatoires.

### R13 — Seed de référence
- **Decision**:
  - `countries.json` : CI et SN passent à `languages ["fr","en"]` et reçoivent leurs règles téléphoniques.
  - **Flags écrits uniquement à la création**. Une nouvelle exécution ne touche pas aux flags ni au statut, et corrige ainsi C11.
  - Liaisons `CountryProduct` CI/SN × auto/voyage créées si absentes (statut `internal`, flags explicites à `false`, revue manuelle à `true`).
  - Textes de consentement brouillons FR et EN par pays (sans produit), version `template-v1`, contenu repris de `consent-templates.json`, empreinte calculée, créés si absents.
  - Mode `--dry-run` conservé.

### R14 — Interface admin
- **Decision**: Pattern A (`useActionState` et états retournés), comme les écrans de formulaires de devis.
  - **Nouvelles routes** : `/catalog` (hub), `/catalog/countries`, `/catalog/countries/[countryId]`, `/catalog/products`, `/catalog/products/[productId]`, `/catalog/regimes`, `/consent-texts`, `/consent-texts/[consentTextId]`.
  - Les bascules de flags sont des formulaires à bouton (pas de `Switch`, qui exige JavaScript). Chaque mutation demande un motif d'au moins 8 caractères, et les refus de l'API sont traduits en messages français.
  - **`/feature-flags`** : bascule des flags globaux non sensibles existants (route PATCH existante) ; les flags sensibles restent en lecture seule.
  - **`/activation-checklist`** : chaque contrôle en échec reçoit un lien « Corriger » vers l'écran concerné. La page reste sans mutation : les liens sont des GET, et le test d'absence de PATCH/POST est conservé.
  - **`/quote-form-definitions`** : alerte FR-019 si le texte référencé a une version publiée plus récente.

### R15 — Hors périmètre confirmé
- Ouverture publique effective : elle reste bloquée par la checklist tant que les specs 051 et 052 ne sont pas livrées.
- Pages légales par pays : seulement vérifiées.
- Contenu juridique définitif : EPIC L.
- Pas de nouveau flag global.
