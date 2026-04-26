<!--
Sync Impact Report
Version change: 1.1.0 -> 1.2.0
Modified principles:
- XI. Gouvernance Spec Kit et activation des features: ajout d'une regle de
  workflow continu apres spec validee pour les features standards.
Added sections:
- Workflow Spec Kit continu
Removed sections:
- none
Templates requiring updates:
- updated: .specify/templates/plan-template.md
- updated: .specify/templates/spec-template.md
- updated: .specify/templates/tasks-template.md
- updated: .specify/templates/checklist-template.md
- reviewed: .specify/templates/commands/*.md not present
- reviewed: .specify/extensions/git/commands/*.md
- updated: AGENTS.md
Existing specs impact:
- Specs terminees existantes restent valides et ne sont pas amendees par cette
  regle. Elle guide les prochaines features standards.
Runtime hook status:
- before_constitution speckit.git.initialize executed; repository already
  initialized, so no Git initialization change was needed.
Follow-up TODOs: none
-->

# AssurMatch Constitution

**Version**: 1.2.0
**Date**: 2026-04-26
**Statut**: Ratified

## Core Principles

### I. Positionnement de plateforme technique
AssurMatch est une plateforme technique B2B2C de comparaison indicative
d'offres d'assurance et de mise en relation avec des courtiers partenaires
agrees. Le produit DOIT afficher ce positionnement dans les parcours publics,
les portails, les documents et les communications transactionnelles.

Must:
- Les offres publiques DOIVENT etre presentees comme indicatives.
- Tout prix, garantie, devis ferme, contrat ou attestation DOIT relever d'un
  courtier, assureur ou partenaire autorise.
- Les parcours DOIVENT identifier le courtier responsable lorsqu'une demande
  lui est transmise.

Must Not:
- La plateforme NE DOIT PAS vendre directement de l'assurance.
- La plateforme NE DOIT PAS permettre la souscription directe en V1.
- La plateforme NE DOIT PAS encaisser de primes en V1.
- La plateforme NE DOIT PAS emettre de contrat ni d'attestation.
- La plateforme NE DOIT PAS se presenter comme courtier, assureur ou agent
  general.
- La plateforme NE DOIT PAS donner de conseil personnalise engageant.
- La plateforme NE DOIT PAS recommander juridiquement un contrat comme choix
  officiel ou definitif.

Rationale: ce positionnement protege l'utilisateur, les partenaires agrees et
AssurMatch contre toute confusion entre prestation technique et activite
reglementee d'intermediation ou d'assurance.

### II. Conformite reglementaire et consentement
Toute fonctionnalite qui collecte, affiche, transmet ou exploite une demande
d'assurance DOIT appliquer les contraintes de conformite avant la valeur
commerciale. La conformite est un pre-requis de routage, de comparaison,
d'administration et d'analyse.

Must:
- Un ConsentRecord DOIT etre collecte avant toute transmission de demande.
- Les consentements DOIVENT etre historises avec date, finalite, pays, produit,
  canal, version du texte et destinataire prevu.
- Les licences des courtiers partenaires DOIVENT etre verifiees avant
  activation et avant routage.
- Un courtier dont la licence est expiree, suspendue ou invalide DOIT etre
  bloque automatiquement pour les produits et pays concernes.
- Les pays, produits, partenaires, offres et modules IA DOIVENT etre
  desactivables rapidement.
- Les mentions legales et le role technique d'AssurMatch DOIVENT rester
  visibles dans les parcours publics et les points de consentement.
- Toutes les actions sensibles DOIVENT produire un AuditLog exploitable.

Must Not:
- Les interfaces NE DOIVENT PAS employer les formulations "acheter maintenant",
  "souscrire maintenant", "contrat valide", "garantie acceptee" ou toute
  formulation equivalente qui implique une decision reglementee par AssurMatch.

Rationale: la confiance du marche repose sur une preuve claire du consentement,
du statut des partenaires et de la responsabilite finale du professionnel agree.

### III. Architecture modulaire et activation progressive
AssurMatch DOIT etre construit large mais active progressivement. Le modele
peut prevoir plusieurs pays, produits et modules, mais l'exposition publique
DOIT etre controlee par feature flags globaux, par pays et par produit.

Architecture cible:
- Frontend: deux applications web Next.js/React separees: Web Publique Client
  et Back-office Partenaires/Plateforme.
- Backend: NestJS en monolithe modulaire initial, organise pour evoluer vers
  des frontieres de domaines plus autonomes si le besoin est prouve.
- Donnees: PostgreSQL est la source de verite; Prisma est l'ORM recommande.
- Redis: cache, feature flags, sessions eventuelles, rate limiting, anti-spam,
  BullMQ, files de jobs, notifications asynchrones, detection de doublons et
  verrous temporaires de routage.
- Jobs: BullMQ avec Redis pour les traitements asynchrones.
- Documents: stockage compatible S3.
- API: REST structuree, avec preparation future pour webhooks et API
  partenaires.

Separation des applications frontend:
- Application Web Publique Client: destinee aux visiteurs, prospects,
  particuliers, professionnels et entreprises. Elle couvre accueil public,
  pages pays, pages produits, comparateur d'offres indicatives, detail d'offre,
  demande de devis, consentement explicite, confirmation de demande, suivi
  public minimal si prevu, contenus publics, FAQ, mentions legales et politique
  de confidentialite.
- Application Back-office Partenaires et Plateforme: destinee aux utilisateurs
  authentifies, dont courtiers Starter, Pro et Enterprise, agents courtiers,
  managers courtiers, administrateurs plateforme, compliance admins, support
  admins, finance admins, content admins et AI admins. Elle couvre portail
  Starter, CRM Pro/Enterprise, dashboards courtiers, back-office admin
  plateforme, gestion pays, produits, offres, partenaires, licences, routage,
  audit logs, consentements, facturation B2B, configuration IA, rapports,
  support et conformite.
- Les parcours visiteurs et les parcours partenaires/admins DOIVENT etre
  separes applicativement.
- L'application publique NE DOIT JAMAIS embarquer d'ecrans, routes,
  privileges, layouts ou politiques d'acces back-office.
- L'application back-office DOIT etre protegee par authentification, RBAC
  strict, MFA selon role, audit et controle du tenant partenaire.
- Les composants UI PEUVENT partager un design system ou des packages communs,
  mais routes, layouts, politiques d'acces et responsabilites fonctionnelles
  DOIVENT rester separes.
- Les API PEUVENT rester dans le meme backend NestJS modulaire, mais les scopes
  d'acces DOIVENT distinguer clairement public, broker et admin.
- Toute fonctionnalite publique DOIT eviter de dependre d'un etat
  d'authentification partenaire ou admin.
- Toute fonctionnalite back-office DOIT etre inaccessible depuis l'application
  publique.
- Les tests Playwright DOIVENT distinguer les smoke tests publics et les smoke
  tests back-office lorsque les deux surfaces sont concernees.
- Les variables d'environnement, domaines, routes et deploiements DOIVENT
  pouvoir etre configures separement pour les deux applications.
- Les futures specs DOIVENT preciser les surfaces impactees: Web Publique
  Client, Back-office Partenaires/Plateforme, Backend API, packages partages,
  ou plusieurs de ces scopes.

Modules backend prevus:
- auth, users, countries, regulatory-regimes, products, offers, partners,
  partner-licenses, quote-requests, leads, routing, broker-portal, broker-crm,
  dashboards, billing, notifications, documents, feature-flags, audit-logs,
  consent, ai, reports, admin, integrations, webhooks, common.

Must:
- Les modules NestJS DOIVENT separer domaine, application et infrastructure.
- Les controleurs DOIVENT rester fins et deleguer la logique metier.
- Aucun traitement lourd NE DOIT etre execute synchronement dans un endpoint
  public.
- Tout module public DOIT etre protege par les feature flags pertinents.
- Toute spec ou plan DOIT identifier explicitement quelle application ou quel
  package est impacte.
- Le lancement public PEUT etre limite a un pays, deux produits, trois a cinq
  courtiers, portail Starter, CRM Pro, dashboard simple et IA limitee.

Feature flags obligatoires:
- Globaux: public_comparator_enabled, quote_request_enabled,
  starter_portal_enabled, broker_crm_enabled, broker_dashboard_enabled,
  billing_enabled, ai_lead_scoring_enabled, ai_summary_enabled,
  ai_duplicate_detection_enabled, ai_recommendation_enabled,
  ai_broker_assistant_enabled, payments_enabled, e_signature_enabled,
  policy_issuance_enabled, claims_enabled, insurer_api_enabled,
  whatsapp_enabled, sponsored_offers_enabled, multi_broker_routing_enabled.
- Par pays: country_public_enabled, country_waitlist_enabled,
  country_quote_enabled, country_comparison_enabled,
  country_broker_onboarding_enabled, country_ai_enabled.
- Par produit: product_public_enabled, product_quote_enabled,
  product_comparison_enabled, product_document_upload_enabled,
  product_sensitive_data_enabled, product_manual_review_required,
  product_ai_scoring_enabled, product_ai_form_assistant_enabled.

Rationale: cette architecture permet d'investir dans les bons domaines sans
forcer une mise en production prematuree de fonctions reglementees ou immatures.

### IV. Securite, acces et protection des donnees
La securite DOIT etre traitee comme une exigence fonctionnelle. Toute feature
qui manipule utilisateurs, leads, documents, licences, offres, paiements,
facturation, IA ou administration DOIT inclure controles d'acces, journalisation
et protection des donnees des la specification.

Must:
- HTTPS DOIT etre obligatoire sur tous les environnements exposes.
- Le RBAC DOIT etre strict et teste pour chaque ressource sensible.
- La MFA DOIT etre obligatoire pour les administrateurs et les courtiers.
- Les donnees sensibles DOIVENT etre chiffrees ou protegees par un mecanisme
  equivalent adapte au risque.
- Les PII DOIVENT etre masquees ou exclues des logs applicatifs.
- Les endpoints publics DOIVENT appliquer rate limiting, anti-spam et validation
  stricte des entrees.
- Chaque acces a une ressource DOIT verifier l'identite, le role, le tenant
  partenaire, le pays, le produit et le plan lorsque pertinent.
- Un courtier NE DOIT JAMAIS voir les leads d'un autre courtier, sauf regle
  d'administration explicite et auditee.
- Les exports DOIVENT etre limites par permission, scope, volume et audit.

Roles principaux:
- Super Admin, Admin Pays, Compliance Admin, Support Admin, Broker Owner
  Starter, Broker Owner Pro, Broker Manager, Broker Agent, Broker Read-only,
  Finance Admin, Content Admin, AI Admin.

Rationale: AssurMatch concentre des donnees personnelles et commerciales
sensibles; l'isolation des partenaires et la preuve d'acces sont essentielles.

### V. Intelligence artificielle assistee et auditee
L'IA DOIT etre centralisee dans un module backend dedie et traitee comme une
aide operationnelle. Elle NE DOIT PAS devenir une decision reglementee
automatique, ni remplacer l'analyse d'un courtier ou assureur agree.

Must:
- Les appels IA DOIVENT passer par le module ai centralise.
- Les prompts, parametres pertinents, resultats, decisions d'affichage et
  validations humaines DOIVENT etre audites selon le niveau de risque.
- Les donnees personnelles envoyees a un modele DOIVENT etre minimisees.
- L'IA DOIT etre desactivable par pays, produit, partenaire et plan.
- Les suggestions sensibles DOIVENT etre soumises a validation humaine.
- Tout contenu IA visible par un utilisateur interne ou partenaire DOIT etre
  marque comme assistance.
- Les fonctions IA DOIVENT avoir des garde-fous testes contre conseil
  personnalise, recommandation officielle, fuite PII et discrimination.

Must Not:
- L'IA NE DOIT PAS declarer qu'elle recommande officiellement un contrat.
- L'IA NE DOIT PAS prendre seule une decision de routage reglementee,
  d'acceptation, de refus, de tarification ferme ou d'eligibilite.

Rationale: l'IA peut accelerer le travail commercial et support, mais la
responsabilite reglementee reste humaine et partenaire.

### VI. Donnees critiques et historique opposable
Les donnees critiques DOIVENT etre modelisees pour permettre audit, resolution
de litige, conformite et analyse operationnelle. La simplicite de V1 NE DOIT PAS
effacer les traces necessaires.

Must:
- Les entites critiques DOIVENT avoir createdAt, updatedAt et createdBy lorsque
  l'auteur est applicable.
- Les actions sensibles DOIVENT avoir un AuditLog horodate avec acteur, action,
  cible, contexte, resultat et correlationId lorsque disponible.
- Les consentements DOIVENT etre historises dans ConsentRecord.
- Les leads DOIVENT avoir un identifiant unique stable.
- Les offres DOIVENT avoir une periode de validite.
- Les licences DOIVENT avoir une date d'expiration et un statut exploitable.
- Les changements d'offres, licences, routages et feature flags DOIVENT etre
  historises.
- Les suppressions ou anonymisations de donnees personnelles DOIVENT conserver
  les preuves minimales necessaires a la conformite lorsque la loi l'autorise.

Rationale: une marketplace reglementee a besoin d'une memoire fiable, pas
uniquement d'un etat courant.

### VII. Routage responsable des leads
Le routage est une fonction critique. Aucun lead NE DOIT etre transmis si les
conditions de consentement, activation, autorisation, licence, quota et
configuration ne sont pas satisfaites.

Must:
- Aucun lead NE DOIT etre route sans consentement valide.
- Aucun lead NE DOIT etre route vers un courtier inactif.
- Aucun lead NE DOIT etre route vers un courtier non autorise pour le pays et
  le produit concernes.
- Aucun lead NE DOIT etre route vers un courtier dont la licence est expiree,
  suspendue ou invalide.
- Les decisions de routage DOIVENT etre journalisees, y compris les refus de
  routage.
- Les quotas, capacites, priorites et exclusions DOIVENT etre respectes.
- Les regles de routage DOIVENT etre configurables et auditees.
- L'IA PEUT suggerer un score ou une priorite, mais les regles metier
  deterministes DOIVENT decider l'eligibilite finale.

Rationale: le routage engage la confiance des visiteurs, la valeur des leads et
la responsabilite des partenaires agrees.

### VIII. UX, contenu et promesses publiques
Les parcours DOIVENT etre simples, rassurants et transparents. Le contenu DOIT
eviter toute promesse de vente, souscription, validation ou recommandation
officielle par AssurMatch.

Must:
- Les CTA publics DOIVENT privilegier "Comparer les offres", "Demander un
  devis" et "Etre rappele par un courtier agree".
- Les interfaces DOIVENT afficher "offre indicative", "prix indicatif" et
  "a confirmer par le courtier partenaire" lorsque pertinent.
- Les offres sponsorisees DOIVENT etre clairement indiquees.
- Le visiteur DOIT comprendre quand sa demande sera transmise, a qui, et pour
  quelle finalite.
- Les erreurs de pays, produit, consentement, licence ou activation DOIVENT etre
  expliquees sans exposer d'informations sensibles.

Must Not:
- Les contenus NE DOIVENT PAS utiliser "Acheter", "Souscrire maintenant",
  "Contrat valide", "La meilleure assurance du marche" ou formulations
  equivalentes.
- Les classements NE DOIVENT PAS masquer les sponsorisations, indisponibilites,
  expirations ou limites indicatives.

Rationale: le vocabulaire produit est une barriere de conformite autant qu'un
levier de confiance.

### IX. Discipline de tests constitutionnels
Les tests DOIVENT prouver les invariants reglementaires, securitaires et
metier. Une feature critique sans tests des cas interdits NE DOIT PAS etre
consideree prete.

Must:
- Chaque module critique DOIT avoir des tests unitaires.
- Le routage DOIT avoir des tests de regles metier.
- Les permissions RBAC DOIVENT etre testees.
- Les feature flags DOIVENT etre testes globalement, par pays et par produit
  lorsque la feature les utilise.
- Les cas de non-consentement DOIVENT etre testes.
- Les cas de licence expiree DOIVENT etre testes.
- Les cas de pays ou produit desactive DOIVENT etre testes.
- Les fonctions IA DOIVENT avoir des tests de garde-fous.
- Les endpoints publics DOIVENT avoir des tests d'integration.
- Les tests de regression DOIVENT couvrir les criteres constitutionnels
  applicables a la feature.

Rationale: les tests sont le moyen le plus direct de transformer les principes
en contraintes executables.

### X. Qualite de code et maintenabilite
Le code DOIT rester explicite, typable, testable et organise par responsabilite.
La vitesse de livraison NE DOIT PAS introduire de logique metier cachee dans les
interfaces ou de duplication fragile.

Must:
- TypeScript strict DOIT etre active.
- Les DTOs DOIVENT etre valides.
- Les erreurs DOIVENT etre standardisees.
- La logique metier NE DOIT PAS vivre dans les controleurs.
- Les services applicatifs DOIVENT exprimer les cas d'usage clairement.
- Les repositories ou services Prisma DOIVENT etre separes de la logique de
  decision metier.
- Les listes DOIVENT etre paginees.
- Les logs DOIVENT etre structures.
- La duplication inutile DOIT etre supprimee lorsqu'elle augmente le risque de
  divergence metier.
- Le nommage DOIT etre explicite et stable.
- Le code DOIT etre documente lorsque la regle metier est sensible, reglementee
  ou non evidente.

Rationale: AssurMatch doit pouvoir evoluer par pays, produit, partenaire et plan
sans rendre les regles impossibles a auditer.

### XI. Gouvernance Spec Kit et activation des features
Toute nouvelle feature DOIT commencer par `/speckit.specify`, puis passer par
planification, taches et implementation selon Spec Kit. Les specs, plans et
taches DOIVENT citer les impacts constitutionnels applicables.

Workflow Spec Kit continu:
- Une fois une spec validee et sans marqueur `[NEEDS CLARIFICATION]`, Code AI
  PEUT enchainer `/speckit.plan`, `/speckit.tasks`, `/speckit.implement` et les
  validations finales sans demander de confirmation intermediaire.
- Cette regle s'applique uniquement si la spec est deja validee, committee ou
  explicitement approuvee par l'utilisateur.
- Code AI DOIT s'arreter avant ou pendant l'enchainement en cas de conflit avec
  la constitution, exigence ambigue ou contradictoire, risque reglementaire,
  risque de securite, risque de fuite de donnees, activation accidentelle d'un
  module interdit, besoin de decision produit non couverte par la spec, ou
  echec bloquant des tests ou validations.
- Code AI NE DOIT PAS faire de commit automatiquement apres implementation,
  sauf instruction explicite de l'utilisateur.
- Code AI DOIT toujours executer les validations finales apres implementation.
- Code AI DOIT cocher les taches terminees dans `tasks.md` au fur et a mesure
  ou a la fin de l'implementation.
- Le rapport final DOIT lister le plan cree, le `tasks.md` cree, le nombre de
  taches terminees, les fichiers principaux modifies, les migrations creees,
  les tests executes, les resultats des validations, les points non termines,
  les risques residuels et la prochaine etape recommandee.
- Cette regle NE PERMET PAS de sauter `/speckit.specify`, de contourner les
  controles constitutionnels, ni d'activer des modules reglementes interdits ou
  desactives par defaut.
- Cette regle NE S'APPLIQUE PAS aux features sensibles ou reglementees futures
  sans validation explicite.

Must:
- Toute implementation DOIT respecter cette constitution.
- Toute exception DOIT etre documentee avec justification, portee, risque,
  approbateur et date de revalidation.
- Toute modification d'un principe constitutionnel DOIT etre versionnee.
- Les specs DOIVENT inclure des criteres d'acceptation Given/When/Then.
- Les plans DOIVENT mentionner impacts securite, conformite, donnees, IA,
  feature flags, routage et tests.
- Les taches DOIVENT etre decoupees par increments testables.
- Pour les features standards dont la spec est validee, le workflow recommande
  DOIT etre `/speckit.plan` -> `/speckit.tasks` -> `/speckit.implement` ->
  validations finales.
- Aucune feature reglementee future, notamment paiements, e-signature,
  emission de police, sinistres, API assureur ou recommandation IA avancee, NE
  DOIT etre activee sans validation explicite.

Rationale: Spec-Driven Development est le systeme de controle qui maintient les
decisions produit, techniques et conformite alignees.

## Constitutional Acceptance Criteria

Les criteres suivants DOIVENT etre repris ou specialises dans les specs et tests
des features concernees.

1. Courtier Starter sans CRM
   Given un courtier en plan Starter, When il ouvre son portail, Then il voit
   uniquement ses leads recus, le detail du lead, accepter, rejeter, contester,
   l'historique minimal, le dashboard basique et les notifications configurees.
   Then il NE voit PAS Kanban, pipeline avance, assignation equipe, taches,
   rappels ou IA commerciale non incluse.

2. Courtier Pro avec CRM
   Given un courtier en plan Pro, When il ouvre son espace commercial, Then il
   accede au CRM complet avec pipeline, notes, taches, rappels, assignation,
   documents, devis, dashboard et IA autorisee par son plan et ses flags.

3. Pays desactive
   Given un pays avec country_public_enabled false, When un visiteur tente de
   comparer ou demander un devis pour ce pays, Then le parcours public est
   bloque ou redirige vers waitlist selon configuration, sans transmission de
   lead.

4. Produit desactive
   Given un produit avec product_public_enabled false ou product_quote_enabled
   false, When un visiteur tente d'utiliser ce produit, Then le produit n'est
   pas disponible publiquement ou la demande de devis est bloquee selon le flag.

5. Absence de consentement
   Given une demande sans ConsentRecord valide, When le systeme tente de la
   transmettre, Then aucun lead n'est route et un AuditLog de refus est cree.

6. Courtier non autorise
   Given un courtier non autorise pour le pays ou le produit, When le moteur de
   routage evalue un lead correspondant, Then ce courtier est exclu des
   candidats et la raison est journalisee.

7. Licence expiree
   Given une licence courtier expiree, suspendue ou invalide, When un routage ou
   une activation partenaire est evalue, Then le partenaire est bloque pour le
   scope concerne et une alerte de conformite est disponible.

8. IA desactivee
   Given un flag IA desactive au niveau global, pays, produit, partenaire ou
   plan, When une fonctionnalite demande une assistance IA, Then aucun appel
   modele n'est effectue et le fallback non IA est utilise ou l'action est
   bloquee avec message adapte.

9. Suggestion IA sensible
   Given une suggestion IA qui influence score, priorite, relance, contenu
   commercial ou analyse de risque, When elle est produite, Then elle est
   marquee comme assistance, auditee et soumise a validation humaine lorsque le
   risque est sensible.

10. Offre expiree
   Given une offre dont la periode de validite est expiree, When le comparateur
   ou le routage consulte les offres, Then l'offre n'est pas affichee comme
   disponible et ne peut pas justifier une promesse de prix.

11. Export non autorise
   Given un utilisateur sans permission d'export sur le scope demande, When il
   tente d'exporter leads, documents, rapports ou donnees personnelles, Then
   l'export est refuse, audite et aucune donnee sensible n'est retournee.

12. Lead non routable
   Given un lead qui echoue consentement, activation pays, activation produit,
   autorisation courtier, licence, quota ou regle de routage, When le routage
   s'execute, Then le lead reste non transmis, la raison est conservee et aucun
   courtier non eligible n'est notifie.

13. Application publique sans back-office
   Given une fonctionnalite de l'Application Web Publique Client, When un
   visiteur accede aux routes publiques, Then aucun ecran, privilege, layout,
   route ou etat d'authentification back-office n'est charge ou requis.

14. Back-office inaccessible depuis le public
   Given une fonctionnalite du Back-office Partenaires/Plateforme, When un
   visiteur non authentifie ou non autorise tente d'y acceder depuis
   l'application publique, Then l'acces est refuse, audite lorsque pertinent et
   aucune donnee partenaire/admin n'est exposee.

## Implementation Compliance Checklists

Avant toute implementation:
- Verifier que la spec commence par `/speckit.specify` et cite les principes
  applicables.
- Verifier que la spec est validee, committee ou explicitement approuvee avant
  tout enchainement automatique `/speckit.plan` -> `/speckit.tasks` ->
  `/speckit.implement`.
- Verifier qu'aucun marqueur `[NEEDS CLARIFICATION]` ne reste avant
  l'enchainement automatique.
- Identifier les surfaces impactees: Web Publique Client, Back-office
  Partenaires/Plateforme, Backend API, packages partages, ou plusieurs.
- Confirmer que routes, layouts, politiques d'acces, variables d'environnement,
  domaines et deploiements restent separables entre les deux applications web.
- Definir pays, produits, plans, roles et feature flags touches.
- Documenter les impacts securite, conformite, donnees, IA, routage,
  notifications, billing et documents.
- Ecrire des criteres Given/When/Then pour les cas heureux et interdits.
- Prevoir tests unitaires, integration, RBAC, flags, audit et garde-fous IA
  selon le scope.
- Prevoir des smoke tests Playwright publics et back-office distincts lorsque
  les deux applications web sont concernees.
- Confirmer qu'aucune formulation interdite ni promesse reglementee n'est
  introduite.
- Confirmer que les endpoints publics ne portent pas de traitements lourds
  synchrones.
- Ne pas faire de commit automatique apres implementation sans instruction
  explicite de l'utilisateur.
- Cocher les taches terminees dans `tasks.md` et executer les validations
  finales avant le rapport final.

Avant activation d'un pays:
- Verifier country_public_enabled et les flags pays associes.
- Confirmer le regime reglementaire, les mentions legales et les textes de
  consentement.
- Verifier la presence de courtiers agrees actifs et licences valides.
- Verifier les produits autorises, les offres valides et les regles de routage.
- Tester desactivation rapide du pays et retour utilisateur.
- Valider logs, alertes conformite, dashboards et support operationnel.

Avant activation d'un produit:
- Verifier product_public_enabled, product_quote_enabled et les flags produit
  associes.
- Confirmer les donnees collectees, la sensibilite produit et les contraintes
  de documents.
- Verifier offres indicatives, validite, sponsorisation et mentions.
- Tester non-consentement, produit desactive, offre expiree et courtier non
  autorise.
- Confirmer les criteres de routage, quotas et controles de licence.

Avant activation d'un module IA:
- Verifier les flags globaux, pays, produit, partenaire et plan.
- Documenter finalite, donnees envoyees, minimisation PII et retention des
  traces.
- Tester absence d'appel modele lorsque l'IA est desactivee.
- Tester garde-fous contre conseil personnalise, recommandation officielle,
  decision automatique et fuite PII.
- Activer audit des prompts, resultats, validations humaines et erreurs.
- Confirmer le marquage visible des contenus IA comme assistance.

## Governance

Cette constitution supersede les pratiques contradictoires dans les specs,
plans, taches, documentation et implementations du projet AssurMatch. En cas de
conflit, la constitution prime jusqu'a amendement explicite.

Amendment procedure:
- Toute proposition d'amendement DOIT decrire le changement, le motif, les
  principes affectes, les impacts sur templates, specs actives, tests et
  operations.
- Toute modification DOIT mettre a jour le Sync Impact Report en tete du
  fichier.
- Toute modification DOIT propager les changements aux templates Spec Kit et aux
  guides runtime concernes dans le meme changement.
- Toute spec future DOIT declarer si elle impacte Web Publique Client,
  Back-office Partenaires/Plateforme, Backend API, packages partages ou
  plusieurs scopes.
- Une spec validee, sans marqueur `[NEEDS CLARIFICATION]`, PEUT declencher un
  workflow continu plan, taches, implementation et validations finales pour les
  features standards, sous reserve des limites de cette constitution.
- Les exceptions temporaires DOIVENT etre tracees avec approbateur, echeance et
  plan de retour a la conformite.

Versioning policy:
- MAJOR: suppression ou redefinition incompatible d'un principe, d'une regle de
  gouvernance ou d'une contrainte reglementaire.
- MINOR: ajout d'un principe, d'une section obligatoire ou extension materielle
  des controles constitutionnels.
- PATCH: clarification, correction, reformulation ou precision sans changement
  semantique.

Compliance review:
- Les specs DOIVENT prouver la conformite avant planification.
- Les plans DOIVENT passer le Constitution Check avant Phase 0 et le repasser
  apres Phase 1.
- Les tasks DOIVENT contenir les travaux de tests et garde-fous requis avant
  implementation.
- Les workflows continus DOIVENT s'interrompre sur conflit constitutionnel,
  ambiguite majeure, risque de conformite, risque de securite, risque de fuite
  de donnees, activation interdite ou validation bloquante.
- Les reviews DOIVENT verifier que les parcours publics et back-office restent
  applicativement separes lorsque le frontend est touche.
- Les reviews DOIVENT verifier consentement, audit, RBAC, feature flags,
  licences, routage, IA, contenu public et donnees critiques.
- Une feature reglementee ou sensible NE DOIT PAS etre activee sans validation
  explicite de conformite.

**Version**: 1.2.0 | **Ratified**: 2026-04-25 | **Last Amended**: 2026-04-26
