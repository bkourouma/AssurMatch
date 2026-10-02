# Feature Specification: Administration du catalogue, des consentements et de l'activation pays/produit

**Feature Branch**: `claude/inspiring-maxwell-58e67d` (branche de session imposée ; pas de branche `050-*` créée)
**Created**: 2026-10-02
**Status**: Draft
**Input**: PRD v0.3 (`docs/prd/prd_v0.3_completion_mise_en_production.md`), EPIC B (B-01 à B-09) et scénario SC-01 « Ouvrir un pays et ses produits ». Décision D-1 : lancement en Côte d'Ivoire (CI) et au Sénégal (SN), produits Automobile et Voyage.
**Validation State**: Draft
**Continuous Workflow Eligible**: No, pas encore. Elle le deviendra quand l'utilisateur aura validé la spec (elle ne contient aucun marqueur `[NEEDS CLARIFICATION]`).

## Why this spec exists

Le PRD v0.3 a constaté qu'**aucun pays ni aucun produit ne peut être ouvert en production sans intervention en base de données** :

- les contrôleurs de domaine des pays, produits, régimes réglementaires et textes de consentement existent, mais aucun n'est exposé au back-office ;
- la page admin `/catalog` est statique et `/feature-flags` est en lecture seule ;
- tous les flags pays et produit valent `false` et ne se modifient qu'en base ;
- un texte de consentement ne conserve que son **empreinte**, pas son **contenu**. Le site public affiche donc un libellé fixe au lieu du texte publié et approuvé par la conformité ;
- un formulaire de devis ne peut pas être publié sans texte de consentement publié. Or seul le seed de démonstration en crée, et il est refusé en préproduction et en production ;
- le seed de référence ne charge ni les modèles de consentement, ni les liaisons pays-produit ;
- le formulaire public ne collecte que le nom, l'e-mail et le téléphone, n'est servi qu'en français, et le téléphone n'est contrôlé que par sa longueur.

Cette spec rend le catalogue administrable de bout en bout. C'est la première étape du chemin critique du PRD v0.3 : les specs 051 (onboarding des courtiers) et 054 (suivi visiteur) en dépendent.

## Constitutional Scope & Compliance *(mandatory)*

- **Technical platform role**: Inchangé. La spec n'ajoute ni vente, ni souscription, ni encaissement, ni contrat, ni attestation, ni conseil. Les textes de consentement publiés rappellent obligatoirement le rôle technique d'AssurMatch (principe II).
- **Impacted application(s)**: Back-office Plateforme (admin) ; Backend API ; packages partagés (contrats) ; base de données (contenu des textes de consentement, règles téléphoniques par pays, persistance des régimes) ; Web Publique Client (affichage du texte de consentement publié, langue du formulaire, nouveaux champs génériques). Le Broker Back-office n'est pas concerné.
- **Affected scopes**: Pays (CI, SN, et tout pays du seed de référence) ; produits (Auto, Voyage, et tout produit du catalogue) ; liaisons pays-produit ; régimes réglementaires ; textes de consentement (`lead_transmission`, `document_upload`, `service_quality_survey`) ; formulaires de devis ; rôles Super Admin, Admin Pays, Compliance Admin, Support Admin (lecture seule).
- **Frontend separation**: Les écrans d'administration vivent uniquement dans l'app admin. Le site public ne lit que des contenus **publiés** par des routes publiques sans authentification. Aucune route, aucun layout et aucun privilège back-office n'est ajouté au site public.
- **Required feature flags**: Flags pays (`country_public_enabled`, `country_waitlist_enabled`, `country_quote_enabled`, `country_comparison_enabled`, `country_broker_onboarding_enabled`) et produit (`product_public_enabled`, `product_quote_enabled`, `product_comparison_enabled`, `product_document_upload_enabled`, `product_manual_review_required`). Les flags IA (`country_ai_enabled`, `product_ai_*`) et les flags globaux sensibles **restent hors de portée** de ces écrans : ils passent par le chemin de conformité audité existant, et l'interface l'explique.
- **Consent and transmission**: Un formulaire de devis ne peut être publié qu'avec un texte `lead_transmission` publié pour le même pays, produit et langue. Le visiteur consent au texte exact publié : contenu affiché et empreinte enregistrée sont identiques. Un texte publié est immuable ; toute modification crée une nouvelle version.
- **Partner license controls**: Pas de modification des contrôles de licence. L'ouverture publique d'un pays reste conditionnée à la présence d'au moins un courtier actif et licencié (checklist d'activation). Cette condition ne sera satisfaite qu'après la spec 051.
- **Audit and data history**: Chaque création, modification, changement de statut, publication, retrait et bascule de flag produit un AuditLog (acteur, cible, avant/après, motif, résultat, correlationId) et un historique (`FeatureFlagHistory` pour les flags). `createdAt`, `updatedAt` et `createdBy` sont renseignés partout.
- **Security and RBAC**: MFA obligatoire. Super Admin : tout. Admin Pays : uniquement les pays de son périmètre et leurs liaisons pays-produit. Compliance Admin : publication et retrait des textes de consentement, et approbation de l'ouverture publique d'un pays ou d'un produit. Support Admin : lecture seule. Chaque mutation exige un motif.
- **Routing impact**: Indirect. Désactiver un pays ou un produit bloque immédiatement les nouvelles demandes et leur routage. Les demandes déjà transmises ne sont pas modifiées.
- **AI impact**: N/A. Aucun appel IA ; les flags IA ne sont pas modifiables ici.
- **UX/content restrictions**: Les textes de consentement et les libellés de formulaire passent la garde des formulations interdites (« acheter », « souscrire maintenant », « contrat valide », « garantie acceptée »…) avant publication. L'interface publique conserve « offre indicative » et le rôle technique.
- **Workflow continuity**: Feature standard. Une fois validée par l'utilisateur, elle peut enchaîner `/speckit.plan` → `/speckit.tasks` → `/speckit.implement` → validations finales.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administrer les pays et leur activation (Priority: P1)

Un Super Admin ou un Admin Pays consulte la liste des pays avec leur statut, régime, devise, langues et flags. Il complète une fiche (par exemple le Sénégal), change son statut (brouillon → interne → pilote → public → suspendu) et bascule ses flags avec un motif. Il peut suspendre un pays en un clic.

**Why this priority**: Sans pays activable, aucun parcours public n'existe. C'est la première étape de SC-01.

**Independent Test**: Sur une base initialisée par le seul seed de référence, un admin passe le Sénégal en statut « interne » et active `country_comparison_enabled`. Le changement est visible dans l'admin et audité. Le site public reste fermé tant que `country_public_enabled` est désactivé.

**Acceptance Scenarios**:

1. **Given** un Super Admin connecté avec MFA, **When** il modifie la devise, les langues ou le régime du Sénégal avec un motif, **Then** la fiche est mise à jour et un AuditLog contient les valeurs avant et après.
2. **Given** un Admin Pays limité à la CI, **When** il tente de modifier le Sénégal, **Then** l'action est refusée, auditée comme refus, et rien n'est modifié.
3. **Given** un pays dont la checklist d'activation n'est pas entièrement verte (aucun courtier actif licencié, aucune offre valide, aucun texte de consentement publié ou aucun formulaire publié), **When** un admin tente d'activer `country_public_enabled`, **Then** l'activation est refusée et l'écran liste les points bloquants, chacun avec un lien vers l'écran qui le corrige.
4. **Given** un pays public, **When** un admin active la suspension avec un motif, **Then** le parcours public du pays est bloqué ou redirigé vers la liste d'attente selon `country_waitlist_enabled`, aucune nouvelle demande n'est acceptée ni routée, et la suspension est auditée.
5. **Given** un Admin Pays, **When** il tente d'activer `country_public_enabled`, **Then** l'action est refusée : seuls un Compliance Admin ou un Super Admin approuvent une ouverture publique.
6. **Given** un admin, **When** il tente de modifier `country_ai_enabled`, **Then** l'écran indique que ce flag sensible suit le chemin de conformité audité et ne propose pas de bascule.

---

### User Story 2 - Administrer les produits et les liaisons pays-produit (Priority: P1)

Un admin gère le catalogue de produits (nom, description, catégorie, sensibilité, documents requis, revue manuelle requise, statut). Il associe un produit à un pays et bascule les flags produit propres à ce pays.

**Why this priority**: Le comparateur, le formulaire et le routage dépendent de la liaison pays-produit. Aucune n'est chargée aujourd'hui en préproduction ou en production.

**Independent Test**: Un admin associe Voyage au Sénégal, active `product_comparison_enabled` pour SN × Voyage, puis vérifie que la liaison et le flag apparaissent, sans effet sur CI × Voyage.

**Acceptance Scenarios**:

1. **Given** le produit Voyage non lié au Sénégal, **When** un admin du périmètre SN crée la liaison avec un motif, **Then** la liaison est créée en statut « interne » avec tous ses flags désactivés, et c'est audité.
2. **Given** SN × Voyage, **When** l'admin active `product_quote_enabled` alors qu'aucun formulaire de devis n'est publié pour SN × Voyage, **Then** l'activation est refusée avec ce motif.
3. **Given** un produit de sensibilité « élevée », **When** l'admin désactive `product_manual_review_required`, **Then** l'action exige l'approbation d'un Compliance Admin.
4. **Given** un produit actif dans deux pays, **When** l'admin le suspend globalement, **Then** il devient indisponible dans tous les pays, les nouvelles demandes sont bloquées, et chaque pays concerné est cité dans l'AuditLog.

---

### User Story 3 - Rédiger, publier et afficher les textes de consentement (Priority: P1)

Un Compliance Admin rédige un texte de consentement par finalité, pays, produit (facultatif) et langue, à partir d'un modèle. Il le prévisualise avec ses variables résolues (nom du courtier, pays, produit, champs transmis), puis le publie. Le site public affiche **exactement** le texte publié, et le consentement enregistré référence cette version.

**Why this priority**: Sans texte publié, aucun formulaire de devis ne peut être publié (FR-020), donc aucune demande n'est possible. C'est aussi une exigence de preuve : le visiteur doit avoir vu le texte qu'il a accepté.

**Independent Test**: Publier un texte `lead_transmission` FR pour CI × Auto, puis vérifier que le formulaire public CI × Auto affiche ce texte mot pour mot, et que le ConsentRecord créé à la soumission référence cette version et la même empreinte.

**Acceptance Scenarios**:

1. **Given** un Compliance Admin, **When** il crée un texte à partir du modèle `lead-transmission-fr`, **Then** un brouillon versionné est créé avec son contenu complet ; l'empreinte est calculée par le système, jamais saisie.
2. **Given** un brouillon contenant « souscrire maintenant », **When** il tente de le publier, **Then** la publication est refusée, avec la formulation fautive identifiée.
3. **Given** un texte `lead_transmission` sans la variable du destinataire (`{{brokerName}}` ou la mention de la règle d'attribution), **When** il tente de le publier, **Then** la publication est refusée, conformément au principe VIII (« à qui »).
4. **Given** un texte publié, **When** quelqu'un tente de le modifier, **Then** c'est refusé ; seule la création d'une nouvelle version est possible.
5. **Given** une nouvelle version publiée, **Then** les formulaires publiés qui référencent l'ancienne version le signalent à l'admin (republication requise), et les consentements déjà enregistrés gardent leur version d'origine.
6. **Given** un Admin Pays sans rôle conformité, **When** il tente de publier, **Then** l'action est refusée et auditée.
7. **Given** un visiteur sur le formulaire CI × Auto en anglais, **Then** le texte affiché est la version EN publiée. Si aucune version EN n'est publiée, le formulaire EN n'est pas disponible (FR-024).

---

### User Story 4 - Publier des formulaires de devis complets et bilingues (Priority: P1)

Un admin publie, pour chaque pays × produit × langue, un formulaire de devis. Ce formulaire comprend les champs génériques du PRD (ville, préférence de contact, délai souhaité, langue préférée, source) en plus des champs propres au produit. Le visiteur reçoit le formulaire dans la langue de la page.

**Why this priority**: Le formulaire actuel ne collecte pas les informations dont le courtier a besoin, et les visiteurs anglophones reçoivent un formulaire en français.

**Independent Test**: Publier les formulaires FR et EN pour CI × Auto. Un visiteur sur `/en/...` voit le formulaire EN ; la demande enregistre la langue et les champs génériques.

**Acceptance Scenarios**:

1. **Given** un texte de consentement publié pour CI × Auto en FR, **When** l'admin crée un formulaire FR, **Then** le brouillon contient d'office les champs génériques obligatoires (nom, e-mail, téléphone, ville, préférence de contact) et les champs génériques facultatifs (délai souhaité, budget indicatif, langue préférée, source), qu'il peut compléter par des champs produit.
2. **Given** un visiteur sur la version anglaise, **When** il ouvre le formulaire CI × Auto, **Then** il reçoit le formulaire EN publié, et la demande enregistre la langue `en`.
3. **Given** un numéro saisi sans indicatif valide pour le pays, ou d'une longueur incorrecte, **When** le visiteur soumet, **Then** la soumission est refusée avec un message expliquant le format attendu (par exemple +225 et 10 chiffres pour la CI, +221 et 9 chiffres pour le Sénégal).
4. **Given** un formulaire publié, **When** l'admin publie une nouvelle version, **Then** la précédente est retirée automatiquement et les demandes déjà reçues conservent la version avec laquelle elles ont été soumises.

---

### User Story 5 - Checklist d'activation actionnable et seed de référence complet (Priority: P2)

La checklist d'activation montre, par pays et par produit, les conditions de la constitution (régime, mentions légales, consentements publiés, formulaires publiés, courtiers actifs licenciés, offres valides, règles de routage). Chaque ligne en échec mène à l'écran qui la corrige. Le seed de référence charge CI et SN, Auto et Voyage, les liaisons pays-produit et les modèles de consentement en brouillon. Tous les flags restent fermés.

**Why this priority**: Rend SC-01 réalisable sans données de démonstration, et rend visibles les blocages qui restent (courtiers et offres : specs 051 et 052).

**Independent Test**: Sur une base vide, exécuter le seed de référence, puis ouvrir la checklist du Sénégal. Toutes les lignes sont rouges avec des liens d'action. Après les User Stories 1 à 4, il ne reste que les lignes « courtiers » et « offres ».

**Acceptance Scenarios**:

1. **Given** une base vide et le seed de référence exécuté deux fois, **Then** le résultat est identique (idempotent), aucun flag n'est activé et aucun texte n'est publié.
2. **Given** la checklist d'un pays, **When** une condition échoue, **Then** la ligne indique la raison sans exposer de donnée sensible et renvoie vers l'écran correctif.

---

### User Story 6 - Régimes réglementaires persistés (Priority: P3)

Un admin consulte et maintient les régimes réglementaires (CIMA, hors CIMA, local) : description, durée de conservation, exigence de revue manuelle. Un pays référence son régime.

**Why this priority**: Les régimes sont aujourd'hui en mémoire seulement. Ils sont utiles à la checklist et à la rétention, mais ne bloquent pas SC-01, car CI et SN relèvent tous deux de la CIMA.

**Independent Test**: Créer un régime, le lier à un pays, redémarrer l'API : le régime et la liaison sont conservés.

**Acceptance Scenarios**:

1. **Given** un Super Admin, **When** il crée ou modifie un régime avec un motif, **Then** il est persisté et audité.
2. **Given** un régime référencé par un pays, **When** on tente de le retirer, **Then** c'est refusé tant qu'un pays le référence.

### Edge Cases

- **Pays désactivé ou en liste d'attente** : le parcours public est bloqué ou redirigé vers la liste d'attente, sans création de demande ni transmission (critère constitutionnel n°3).
- **Produit désactivé ou devis désactivé** : produit indisponible ou formulaire bloqué selon le flag (critère n°4). Un produit qui exige une revue manuelle envoie la demande en revue.
- **Consentement manquant ou périmé** : aucun formulaire publiable sans texte publié ; une demande ne peut référencer qu'un texte publié non retiré ; à défaut, rien n'est transmis et le refus est audité (critère n°5).
- **Texte de consentement retiré pendant qu'un visiteur remplit le formulaire** : la soumission est refusée avec invitation à recharger. Le consentement n'est jamais rattaché silencieusement à une autre version.
- **Licence, courtier, offre** : hors de cette spec. La checklist les affiche comme conditions d'ouverture publique non remplies.
- **IA** : flags non modifiables ici ; aucun appel modèle.
- **Permissions** : Admin Pays hors périmètre, Support Admin en écriture, rôle non conformité qui publie : tout est refusé et audité. Aucun export n'est ajouté.
- **Séparation des applications** : les routes publiques ne servent que des contenus publiés et ne chargent aucun état d'authentification back-office. Les écrans admin sont inaccessibles depuis le site public (critères n°13 et n°14).
- **Entrées publiques** : anti-spam, limitation de débit et détection de doublons inchangés ; la validation du téléphone par pays s'y ajoute.
- **Désactivation rapide** : désactiver est toujours possible immédiatement, sans checklist. Seule l'activation est conditionnée.
- **Accès concurrents** : deux admins modifient la même fiche ; la seconde écriture est refusée si la fiche a changé entre-temps, plutôt que d'écraser silencieusement.

## Requirements *(mandatory)*

### Functional Requirements

**Pays**
- **FR-001**: Le back-office MUST permettre de lister, consulter, créer et modifier les pays : nom, code ISO, devise, langues, fuseau, famille et régime réglementaire, règles téléphoniques (indicatif, longueurs admises), statut.
- **FR-002**: Le système MUST appliquer les transitions de statut pays brouillon → interne → pilote → public, et suspendu ↔ (interne, pilote, public), retiré. Chaque transition exige un motif.
- **FR-003**: Le système MUST permettre de basculer chaque flag pays non sensible avec un motif, et historiser l'ancienne valeur, la nouvelle, l'acteur et la date.
- **FR-004**: Le système MUST refuser d'activer `country_public_enabled` (ou de passer un pays en statut « public ») tant que la checklist d'activation du pays n'est pas entièrement satisfaite, et seulement sur action d'un Compliance Admin ou d'un Super Admin.
- **FR-005**: Le système MUST permettre de désactiver ou de suspendre un pays immédiatement, sans condition préalable autre que le motif.

**Produits et liaisons**
- **FR-006**: Le back-office MUST permettre de lister, créer et modifier les produits : clé, nom, description, catégorie, sensibilité, documents requis, revue manuelle requise, statut.
- **FR-007**: Le back-office MUST permettre de créer, consulter et retirer une liaison pays-produit, et de basculer ses flags produit non sensibles avec un motif.
- **FR-008**: Le système MUST refuser d'activer `product_quote_enabled` pour un pays × produit sans formulaire de devis publié, et `product_public_enabled` sans au moins un texte `lead_transmission` publié pour ce pays × produit.
- **FR-009**: Le système MUST exiger l'approbation d'un Compliance Admin pour désactiver `product_manual_review_required` sur un produit de sensibilité élevée.

**Textes de consentement**
- **FR-010**: Le système MUST conserver le **contenu complet** de chaque texte de consentement et calculer lui-même son empreinte à partir de ce contenu.
- **FR-011**: Le back-office MUST permettre à un Compliance Admin de créer un texte (finalité, pays, produit facultatif, canal, langue, catégorie de destinataire, contenu), éventuellement à partir d'un modèle du seed, de le prévisualiser avec ses variables résolues, puis de le publier ou de le retirer.
- **FR-012**: Le système MUST refuser la publication d'un texte qui contient une formulation interdite, ou d'un texte `lead_transmission` qui ne désigne pas le destinataire (variable du courtier ou description de la règle d'attribution) et ne rappelle pas le rôle technique d'AssurMatch.
- **FR-013**: Un texte publié MUST être immuable. Toute modification crée une nouvelle version, et les consentements enregistrés gardent la référence de leur version.
- **FR-014**: Le site public MUST afficher le contenu exact du texte publié qui s'applique (pays, produit, langue), variables résolues, et le ConsentRecord MUST référencer cette version et son empreinte.

**Formulaires de devis**
- **FR-015**: Le système MUST proposer d'office, dans chaque nouveau formulaire, les champs génériques du PRD v0.2 §16. Obligatoires : nom, e-mail, téléphone, ville, préférence de contact. Facultatifs : délai souhaité, budget indicatif, langue préférée, source.
- **FR-016**: Le site public MUST demander le formulaire dans la langue de la page et enregistrer cette langue sur la demande.
- **FR-017**: Le système MUST valider le téléphone selon les règles du pays de la demande (indicatif et longueur), côté public et côté serveur.
- **FR-018**: La publication d'un nouveau formulaire MUST retirer automatiquement la version précédente pour le même pays × produit × langue. Les demandes existantes gardent leur version.
- **FR-019**: Le back-office MUST signaler les formulaires publiés qui référencent un texte de consentement remplacé par une version plus récente.
- **FR-020**: Le système MUST refuser de publier un formulaire sans texte `lead_transmission` publié, dans la même langue, pour le même pays et le même produit (ou pour le pays, si le texte n'est pas propre au produit).

**Checklist, seed, régimes**
- **FR-021**: La checklist d'activation MUST indiquer, pour chaque pays et chaque pays × produit, l'état de chaque condition constitutionnelle, avec un lien vers l'écran correctif.
- **FR-022**: Le seed de référence MUST charger, de façon idempotente : CI et SN (régime CIMA, devise XOF, langues fr et en, règles téléphoniques), les produits Auto et Voyage, les liaisons CI et SN × Auto et Voyage, et les modèles de consentement FR et EN en brouillon. Aucun flag ne doit être activé.
- **FR-023**: Les régimes réglementaires MUST être persistés et administrables (création, modification, retrait refusé s'ils sont référencés).
- **FR-024**: Si aucun formulaire publié n'existe dans la langue demandée, le site public MUST l'indiquer et proposer la langue disponible, sans servir silencieusement une autre langue.

**Transverses**
- **FR-025**: Le système MUST appliquer RBAC, périmètre pays de l'Admin Pays et MFA à chaque lecture et mutation de ces écrans.
- **FR-026**: Chaque mutation MUST produire un AuditLog (acteur, action, cible, avant/après, motif, résultat, correlationId), y compris les refus.
- **FR-027**: Les flags sensibles (IA, paiements, multi-courtiers, SMS, WhatsApp, webhooks, purge) MUST rester non modifiables depuis ces écrans. L'interface indique la procédure de conformité qui s'applique.
- **FR-028**: Une modification concurrente d'une même fiche MUST être détectée, et la seconde écriture refusée avec invitation à recharger.
- **FR-029**: Les routes publiques MUST ne servir que des contenus publiés et ne charger aucun état d'authentification back-office.

### Key Entities *(include if feature involves data)*

- **Country** : identité, devise, langues, fuseau, régime, règles téléphoniques (nouveau), statut, flags pays, `publicSince`.
- **Product** : identité, catégorie, sensibilité, documents requis, revue manuelle requise, statut, flags globaux du produit.
- **CountryProduct** : liaison pays-produit, statut, flags produit propres au pays.
- **RegulatoryRegime** : clé, nom, description, durée de conservation spécifique, revue manuelle requise, statut. Désormais persisté.
- **ConsentText** : finalité, pays, produit, canal, langue, catégorie de destinataire, version, statut (brouillon, revue, publié, retiré), **contenu** (nouveau), empreinte calculée, `publishedAt`, `retiredAt`.
- **QuoteFormDefinition** : pays, produit, langue, version, statut, champs (génériques et produit), texte de consentement référencé.
- **QuoteRequest** : langue de la demande (nouveau) ; référence du formulaire et du texte de consentement utilisés.
- **ConsentRecord** : version et empreinte du texte accepté (inchangé, désormais alimenté par le texte réellement affiché).
- **FeatureFlag / FeatureFlagHistory** : flags pays et produit modifiables avec historique.
- **AuditLog** : toutes les mutations et tous les refus ci-dessus.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sur une base initialisée par le seul seed de référence, un admin prépare la CI et le Sénégal (Auto et Voyage, consentements FR et EN publiés, formulaires FR et EN publiés) en moins de 45 minutes, sans aucune commande en base ni script.
- **SC-002**: 100 % des formulaires publics affichent un texte de consentement dont le contenu correspond, caractère pour caractère, à la version référencée par le ConsentRecord créé à la soumission.
- **SC-003**: 0 activation publique d'un pays ou d'un produit possible tant que la checklist correspondante comporte une condition non satisfaite (tests sur chaque condition).
- **SC-004**: 100 % des mutations et des refus de ces écrans sont retrouvables dans les journaux d'audit avec motif et acteur.
- **SC-005**: 0 accès autorisé d'un Admin Pays hors de son périmètre et 0 publication de consentement par un rôle non conformité (tests RBAC).
- **SC-006**: La désactivation d'un pays ou d'un produit bloque les nouvelles demandes en moins d'une minute.
- **SC-007**: 100 % des visiteurs de la version anglaise reçoivent le formulaire et le texte de consentement en anglais, ou un message explicite si la version anglaise n'est pas publiée.
- **SC-008**: 0 route publique ne charge d'état d'authentification ou de privilège back-office (tests de séparation existants étendus).

## Assumptions

- Le lancement porte sur la CI et le Sénégal, avec Auto et Voyage (D-1). Les autres pays du seed de référence restent en brouillon, mais sont administrables par les mêmes écrans.
- Les contenus légaux définitifs des consentements sont fournis par la conformité (EPIC L). Cette spec fournit l'outillage et charge les modèles en brouillon ; elle ne rédige pas le texte juridique.
- Les règles téléphoniques de départ sont l'indicatif +225 avec 10 chiffres nationaux pour la CI, et +221 avec 9 chiffres nationaux pour le Sénégal. Elles restent modifiables par l'admin.
- L'ouverture publique effective d'un pays attend les specs 051 (courtiers licenciés) et 052 (offres). Cette spec rend la condition visible ; elle ne la contourne pas.
- Les pages légales (mentions, confidentialité) restent en TypeScript versionné (pas de CMS). La checklist vérifie seulement qu'une surcharge existe pour le pays.
- La garde des formulations interdites réutilise la liste partagée existante, avec ses équivalents anglais déjà couverts par des tests.
- Le Broker Back-office et le parcours après soumission (suivi, notifications) ne sont pas modifiés ici : specs 051, 054 et 055.
- Dépendances : contrôleurs de domaine existants (pays, produits, consentements, régimes), service des flags avec historique, service de checklist d'activation, définitions de formulaires (spec 043), garde des formulations interdites.
