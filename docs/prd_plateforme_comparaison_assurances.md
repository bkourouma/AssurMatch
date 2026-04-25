# PRD — Plateforme de comparaison d’assurances + CRM pour courtiers agréés

**Nom de code :** AssurMatch  
**Version :** v0.2  
**Date :** 25 avril 2026  
**Positionnement :** plateforme technique B2B2C permettant aux visiteurs de comparer des offres indicatives d’assurance, de demander des devis et de transmettre leurs demandes à des courtiers partenaires agréés.  
**Statut réglementaire visé :** prestataire technique / fournisseur de solution digitale, pas courtier, pas assureur, pas agent général.

---

## 1. Vision produit

Créer une plateforme panafricaine de comparaison d’offres d’assurance permettant aux particuliers, professionnels et entreprises de :

1. sélectionner un pays ;
2. choisir un produit d’assurance ;
3. comparer des offres indicatives ;
4. demander un devis ;
5. être mis en relation avec un courtier partenaire agréé.

Côté courtier, la plateforme fournit selon le plan choisi :

1. réception de demandes qualifiées ;
2. notifications de leads ;
3. portail de suivi simplifié ;
4. CRM complet pour les plans avancés ;
5. dashboard de performance ;
6. outils IA d’aide à la qualification, au résumé, au scoring et au suivi commercial ;
7. facturation B2B ;
8. statistiques de conversion.

La solution initiale doit être construite de manière large : tous les pays, produits, modules et fonctionnalités futures peuvent être prévus dès l’architecture, mais activés progressivement via feature flags.

---

## 2. Positionnement réglementaire

La plateforme doit rester dans un rôle de **partenaire technique**.

Elle ne doit pas :

- vendre directement de l’assurance ;
- encaisser les primes en V1 ;
- émettre des contrats ;
- émettre des attestations ;
- se présenter comme courtier ;
- donner un conseil personnalisé engageant ;
- remplacer l’analyse du courtier agréé.

Elle doit :

- afficher clairement son rôle de plateforme technique ;
- transmettre les demandes uniquement avec consentement ;
- identifier le courtier partenaire responsable ;
- tracer les consentements ;
- vérifier les partenaires avant activation ;
- permettre la désactivation rapide d’un pays, produit, partenaire ou offre.

Mention recommandée :

> “AssurMatch est une plateforme technique de comparaison et de mise en relation. AssurMatch n’est pas une compagnie d’assurance, n’est pas courtier d’assurance et ne fournit pas de conseil personnalisé en assurance. Les devis fermes, la souscription, l’encaissement des primes, l’émission des contrats et le traitement des sinistres sont réalisés par les courtiers ou assureurs agréés partenaires.”

---

## 3. Objectifs business

| Objectif | Description |
|---|---|
| Générer des demandes qualifiées | Transformer les visiteurs en prospects exploitables pour les courtiers. |
| Monétiser par abonnement | Créer un revenu récurrent auprès des courtiers partenaires. |
| Monétiser par lead | Facturer les demandes valides selon les règles du contrat partenaire. |
| Fournir une solution SaaS | Offrir aux courtiers un portail, un CRM et des outils de suivi. |
| Préparer l’expansion | Prévoir une architecture multi-pays, multi-produits et multi-partenaires. |
| Intégrer l’IA | Utiliser l’IA pour améliorer la qualification, la productivité et l’expérience utilisateur. |
| Rester conforme | Éviter d’être requalifié en courtier non agréé. |

---

## 4. Objectifs utilisateurs

| Utilisateur | Objectif |
|---|---|
| Visiteur particulier | Comparer simplement et demander un devis. |
| Visiteur entreprise | Obtenir une orientation rapide vers un courtier compétent. |
| Courtier Starter | Recevoir des demandes qualifiées sans utiliser un CRM complet. |
| Courtier Pro | Gérer les leads dans un CRM intégré. |
| Courtier Enterprise | Piloter équipes, agences, API, dashboards et reporting avancé. |
| Admin plateforme | Gérer pays, produits, offres, courtiers, facturation et conformité. |
| Compliance admin | Contrôler licences, consentements, audit logs et textes légaux. |

---

## 5. Business model

Le modèle principal est :

> **Abonnement B2B + paiement par lead qualifié + frais d’intégration + options IA/API/white label.**

Le visiteur ne paie pas. Les courtiers paient pour la visibilité, les demandes qualifiées, les outils de traitement et les services à valeur ajoutée.

---

## 6. Plans commerciaux

## 6.1 Plan Starter — sans CRM

Le plan Starter est destiné aux petits courtiers ou aux partenaires en phase de test.

### Principe

Le courtier ne dispose pas d’un CRM complet. Il reçoit les demandes qualifiées par email, WhatsApp, SMS ou portail simplifié.

### Fonctionnalités incluses

| Fonctionnalité | Statut |
|---|---|
| Réception de leads qualifiés | Oui |
| Notification email | Oui |
| Notification WhatsApp/SMS | Optionnel |
| Portail simplifié de consultation | Oui |
| Acceptation/rejet d’un lead | Oui |
| Historique minimal des leads reçus | Oui |
| Export CSV simple | Optionnel |
| Dashboard basique | Oui |
| CRM Kanban complet | Non |
| Gestion tâches/rappels | Non |
| Assignation équipe | Non |
| Notes commerciales avancées | Non |
| Pipeline complet | Non |
| IA avancée commerciale | Non ou limitée |

### Objectif du plan Starter

- permettre aux courtiers de tester la plateforme ;
- réduire la barrière d’entrée ;
- vendre ensuite une montée vers Pro ;
- garder le produit simple pour les petits cabinets.

---

## 6.2 Plan Pro — CRM intégré

Le plan Pro est destiné aux courtiers actifs qui veulent gérer leurs leads dans la plateforme.

### Fonctionnalités incluses

| Fonctionnalité | Statut |
|---|---|
| Leads qualifiés | Oui |
| CRM Kanban | Oui |
| Pipeline commercial | Oui |
| Notes internes | Oui |
| Tâches et rappels | Oui |
| Assignation des leads | Oui |
| Upload documents | Oui |
| Devis joints ou saisis | Oui |
| Dashboard courtier | Oui |
| Scoring IA des leads | Oui |
| Résumé IA de demande | Oui |
| Suggestions IA de relance | Oui |
| Détection doublons IA | Oui |
| Export avancé | Oui |

---

## 6.3 Plan Enterprise

Le plan Enterprise est destiné aux grands cabinets, réseaux de courtage, groupes ou partenaires institutionnels.

### Fonctionnalités incluses

| Fonctionnalité | Statut |
|---|---|
| Multi-agences | Oui |
| Multi-utilisateurs avancé | Oui |
| Rôles personnalisés | Oui |
| API partenaires | Oui |
| Webhooks | Oui |
| Reporting avancé | Oui |
| SLA prioritaire | Oui |
| Intégrations CRM externes | Oui |
| IA avancée | Oui |
| White label | Optionnel |
| Domaine personnalisé | Optionnel |
| Tableaux de bord consolidés | Oui |

---

## 6.4 Revenus additionnels

| Revenu | Description | Activation |
|---|---|---|
| Frais d’installation | Paramétrage courtier, formation, configuration | V1 |
| Abonnement mensuel | Accès au portail selon plan | V1 |
| Lead qualifié | Facturation par demande valide | V1 |
| Pack de leads | Crédit prépayé | V1.1 |
| Module IA | Add-on pour scoring, résumés, relances | V1.1 |
| API | Connexion avec systèmes du courtier | V1.2 |
| White label | Version personnalisée | V1.2 |
| Commission sur prime | À éviter au départ | Désactivé |
| Paiement prime | Non recommandé au départ | Désactivé |

---

## 7. Périmètre initial

## 7.1 Inclus dans la solution initiale

| Module | Inclus dès le départ | Activé au lancement |
|---|---:|---:|
| Catalogue pays | Oui | Partiellement |
| Catalogue produits | Oui | Partiellement |
| Pages publiques pays/produits | Oui | Selon pays activés |
| Comparateur d’offres | Oui | Oui sur pilotes |
| Demande de devis | Oui | Oui sur pilotes |
| Routage des leads | Oui | Oui |
| Portail courtier Starter | Oui | Oui |
| CRM courtier Pro | Oui | Oui pour plans Pro |
| Dashboard courtier | Oui | Selon plan |
| Dashboard admin | Oui | Oui |
| Gestion partenaires | Oui | Oui |
| Gestion licences | Oui | Oui |
| Facturation B2B | Oui | Optionnel au lancement |
| Notifications email | Oui | Oui |
| Notifications SMS/WhatsApp | Oui | Optionnel |
| IA de qualification | Oui | Progressive |
| IA de résumé | Oui | Progressive |
| IA de détection doublons | Oui | Progressive |
| API partenaires | Prévue | Désactivée ou limitée |
| Paiement prime | Prévu | Non |
| Signature électronique | Prévue | Non |
| Émission de police | Prévue | Non |
| Gestion sinistres | Prévue | Non |
| Espace client final | Prévu | Minimal ou non activé |

---

## 7.2 Hors périmètre actif en V1

- vente directe d’assurance ;
- encaissement des primes ;
- conseil personnalisé automatisé ;
- émission d’attestation ;
- émission de police ;
- traitement de sinistre ;
- commission directe sur prime ;
- tarification actuarielle complexe ;
- chatbot qui recommande juridiquement un contrat ;
- automatisation complète de souscription.

---

## 8. Principe produit : construire large, activer petit

La plateforme doit être conçue dès le départ pour gérer :

- plusieurs pays ;
- plusieurs régimes réglementaires ;
- plusieurs devises ;
- plusieurs langues ;
- plusieurs produits ;
- plusieurs courtiers ;
- plusieurs assureurs ;
- plusieurs plans commerciaux ;
- plusieurs niveaux d’accès ;
- plusieurs modules IA ;
- plusieurs règles de routage.

Mais au lancement public, seuls quelques pays, produits et partenaires doivent être activés.

---

## 9. Feature flags

## 9.1 Feature flags globaux

| Flag | Description | Défaut |
|---|---|---|
| public_comparator_enabled | Active le comparateur public | False |
| quote_request_enabled | Active les demandes de devis | False |
| starter_portal_enabled | Active portail simplifié Starter | True |
| broker_crm_enabled | Active CRM courtier Pro | True |
| broker_dashboard_enabled | Active dashboard courtier | True |
| billing_enabled | Active facturation | False |
| ai_lead_scoring_enabled | Active scoring IA des leads | False |
| ai_summary_enabled | Active résumé IA des demandes | False |
| ai_duplicate_detection_enabled | Active détection intelligente des doublons | False |
| ai_recommendation_enabled | Active recommandations indicatives | False |
| ai_broker_assistant_enabled | Active assistant IA courtier | False |
| payments_enabled | Active paiement prime | False |
| e_signature_enabled | Active signature électronique | False |
| policy_issuance_enabled | Active émission contrat | False |
| claims_enabled | Active sinistres | False |
| insurer_api_enabled | Active API assureur | False |
| whatsapp_enabled | Active WhatsApp | False |
| sponsored_offers_enabled | Active offres sponsorisées | False |
| multi_broker_routing_enabled | Active envoi multi-courtiers | False |

## 9.2 Feature flags par pays

| Flag | Description |
|---|---|
| country_public_enabled | Pays visible publiquement |
| country_waitlist_enabled | Page d’attente disponible |
| country_quote_enabled | Demande de devis possible |
| country_comparison_enabled | Comparateur actif |
| country_broker_onboarding_enabled | Onboarding courtier actif |
| country_ai_enabled | IA active dans ce pays |

## 9.3 Feature flags par produit

| Flag | Description |
|---|---|
| product_public_enabled | Produit visible |
| product_quote_enabled | Demande possible |
| product_comparison_enabled | Comparaison possible |
| product_document_upload_enabled | Upload autorisé |
| product_sensitive_data_enabled | Données sensibles autorisées |
| product_manual_review_required | Revue humaine obligatoire |
| product_ai_scoring_enabled | Scoring IA actif |
| product_ai_form_assistant_enabled | Assistant IA formulaire actif |

---

## 10. Modules IA à intégrer

L’IA doit être utilisée comme un outil d’aide à la productivité, à la compréhension et à la qualification. Elle ne doit pas remplacer le courtier agréé dans le conseil, le devis ferme ou la souscription.

---

## 10.1 IA côté visiteur

### Objectifs

- aider l’utilisateur à comprendre les produits ;
- simplifier le formulaire ;
- reformuler les besoins ;
- orienter vers le bon produit ;
- améliorer le taux de conversion ;
- réduire les demandes incomplètes.

### Fonctionnalités

| Fonction IA | Description | Priorité |
|---|---|---|
| Assistant de choix produit | Aide l’utilisateur à identifier le type d’assurance adapté à son besoin | P1 |
| Explication simple des garanties | Reformule les garanties en langage clair | P1 |
| Aide au remplissage du formulaire | Explique les champs demandés | P1 |
| Résumé de besoin | Génère un résumé clair de la demande avant envoi | P0 |
| Vérification de cohérence | Détecte incohérences évidentes dans le formulaire | P1 |
| FAQ intelligente | Répond aux questions générales non personnalisées | P1 |
| Traduction automatique | Français/anglais/local selon pays | P2 |

### Garde-fous

- L’IA ne doit pas dire “vous devez souscrire cette assurance”.
- L’IA doit utiliser des formulations comme “selon les informations fournies, ce produit pourrait correspondre à votre besoin”.
- L’IA doit rappeler que le courtier partenaire confirmera le devis et les conditions.

---

## 10.2 IA côté courtier

### Objectifs

- faire gagner du temps au courtier ;
- mieux qualifier les demandes ;
- prioriser les prospects ;
- aider aux relances ;
- améliorer la conversion.

### Fonctionnalités

| Fonction IA | Description | Plan |
|---|---|---|
| Résumé automatique du lead | Résume besoin, urgence, produit, éléments manquants | Pro/Enterprise |
| Score de qualité du lead | Évalue complétude, urgence, sérieux, contactabilité | Pro/Enterprise |
| Détection de doublons | Repère prospects similaires ou demandes répétées | Pro/Enterprise |
| Suggestion de prochaine action | Propose rappeler, demander document, envoyer devis | Pro/Enterprise |
| Modèle de message de relance | Génère SMS/email/WhatsApp de relance | Pro/Enterprise |
| Classification automatique | Classe le lead par produit, urgence, segment | Pro/Enterprise |
| Extraction documentaire | Lit les documents uploadés pour extraire informations utiles | Enterprise |
| Analyse des pertes | Résume les raisons de leads perdus | Enterprise |
| Assistant manager | Résume performance équipe, alertes et recommandations | Enterprise |

---

## 10.3 IA côté admin plateforme

### Objectifs

- détecter les anomalies ;
- améliorer la qualité des offres ;
- faciliter l’administration ;
- surveiller la conformité ;
- produire des rapports.

### Fonctionnalités

| Fonction IA | Description | Priorité |
|---|---|---|
| Détection de leads suspects | Spam, faux numéros, demandes incohérentes | P1 |
| Détection d’offres obsolètes | Alerte sur offres non mises à jour | P1 |
| Contrôle de cohérence des offres | Compare prix, garanties, dates, exclusions | P1 |
| Génération de rapports | Résume activité pays/produit/courtier | P1 |
| Analyse de performance | Identifie produits et partenaires performants | P1 |
| Aide au support | Résume tickets, propose réponses | P2 |
| Audit assisté | Met en évidence anomalies de consentement ou routage | P1 |

---

## 10.4 IA et conformité

L’IA doit être encadrée par des règles strictes :

- aucune décision réglementée entièrement automatisée ;
- pas de conseil contractuel définitif ;
- pas de promesse de garantie ;
- pas de validation automatique de souscription ;
- traçabilité des recommandations IA ;
- possibilité de désactiver l’IA par pays, produit ou partenaire ;
- mention visible lorsque du contenu est généré par IA ;
- validation humaine obligatoire pour tout contenu sensible.

---

## 11. Catalogue pays

### Objectif

Créer une base de pays extensible couvrant les pays CIMA, les pays membres ou liés à l’écosystème FANAF et les marchés futurs.

### Exigences

| ID | Exigence | Priorité |
|---|---|---|
| GEO-001 | Créer un pays avec nom, code ISO, devise, langues, fuseau horaire | P0 |
| GEO-002 | Marquer un pays comme CIMA, FANAF, hors CIMA, pilote, actif, inactif | P0 |
| GEO-003 | Définir les produits autorisés par pays | P0 |
| GEO-004 | Définir les partenaires actifs par pays | P0 |
| GEO-005 | Désactiver instantanément un pays côté public | P0 |
| GEO-006 | Configurer textes légaux par pays | P1 |
| GEO-007 | Configurer règles données personnelles par pays | P1 |
| GEO-008 | Configurer règles de routage par pays | P0 |
| GEO-009 | Activer/désactiver IA par pays | P1 |

### Statuts pays

- Draft
- Interne
- Test partenaire
- Pilote
- Public
- Suspendu
- Retiré

---

## 12. Catalogue produits

### Objectif

Créer tous les produits dans le back-office, même si seuls certains sont publics au départ.

### Catégories initiales

| Catégorie | Produits possibles |
|---|---|
| Auto / moto | RC auto, tous risques, flotte auto, moto |
| Santé | santé individuelle, santé famille, complémentaire santé |
| Voyage | court séjour, étudiant, business |
| Habitation | multirisque habitation, locataire, propriétaire |
| Vie / épargne | prévoyance, retraite, épargne, décès |
| Entreprise | multirisque professionnelle, responsabilité civile pro |
| Transport | marchandises transportées, flotte, transit |
| Agricole | récolte, bétail, indicielle |
| Scolaire | assurance scolaire, accident individuel |
| Microassurance | produits simples à faible prime |
| Crédit / caution | caution, garantie, crédit |
| Cyber | cyber-risque PME |
| Événementiel | assurance événement, annulation |
| Construction | chantier, construction, décennale si applicable |

### Exigences

| ID | Exigence | Priorité |
|---|---|---|
| PROD-001 | Créer une catégorie produit | P0 |
| PROD-002 | Créer un produit par pays | P0 |
| PROD-003 | Activer/désactiver un produit par pays | P0 |
| PROD-004 | Configurer formulaire dynamique par produit | P0 |
| PROD-005 | Configurer documents requis par produit | P0 |
| PROD-006 | Configurer critères de comparaison par produit | P0 |
| PROD-007 | Configurer texte légal et disclaimer par produit | P0 |
| PROD-008 | Gérer versioning des produits | P1 |
| PROD-009 | Historiser les changements de conditions | P1 |
| PROD-010 | Définir si IA autorisée pour ce produit | P1 |

---

## 13. Module offres

### Objectif

Permettre aux admins ou courtiers autorisés d’enregistrer des offres comparables avec validation et traçabilité.

### Types d’offres

| Type | Description |
|---|---|
| Offre indicative | Prix ou garanties indicatifs, à confirmer par courtier |
| Offre partenaire | Offre validée par un courtier |
| Offre assureur | Offre validée directement par un assureur |
| Offre sponsorisée | Offre mise en avant contre rémunération |
| Offre privée | Visible seulement par le courtier |
| Offre brouillon | Non visible publiquement |

### Champs principaux

- pays ;
- produit ;
- assureur porteur du risque ;
- courtier distributeur ;
- nom commercial ;
- description courte ;
- garanties principales ;
- exclusions principales ;
- franchises ;
- plafonds ;
- documents requis ;
- délai moyen de traitement ;
- prime indicative ;
- devise ;
- période de validité ;
- dernière mise à jour ;
- source de l’information ;
- statut de validation ;
- résumé IA optionnel ;
- score de complétude de l’offre.

### Exigences

| ID | Exigence | Priorité |
|---|---|---|
| OFFER-001 | Créer une offre depuis le back-office | P0 |
| OFFER-002 | Associer offre à pays, produit, courtier, assureur | P0 |
| OFFER-003 | Définir prime indicative ou fourchette | P0 |
| OFFER-004 | Afficher date de mise à jour | P0 |
| OFFER-005 | Masquer automatiquement les offres expirées | P0 |
| OFFER-006 | Marquer une offre comme sponsorisée | P1 |
| OFFER-007 | Exiger validation admin avant publication | P0 |
| OFFER-008 | Garder historique des versions | P1 |
| OFFER-009 | Afficher le partenaire responsable | P0 |
| OFFER-010 | Utiliser IA pour vérifier cohérence et complétude | P1 |

---

## 14. Comparateur public

### Objectif

Permettre au visiteur de comparer selon des critères objectifs sans transformer la plateforme en vendeur d’assurance.

### Écrans

1. Accueil
2. Sélection pays
3. Sélection produit
4. Formulaire de critères
5. Résultats comparatifs
6. Détail offre
7. Demande de devis
8. Confirmation

### Règles d’affichage

- CTA principal : “Demander un devis”.
- Éviter : “Acheter”, “Souscrire maintenant”, “Contrat validé”.
- Mention obligatoire : “Informations indicatives à confirmer par le courtier partenaire.”
- Offre sponsorisée : mention visible “Sponsorisé”.
- Prix indicatif : afficher “à partir de”, “estimation” ou “prix indicatif”.

### Exigences

| ID | Exigence | Priorité |
|---|---|---|
| COMP-001 | Afficher offres par pays/produit actif | P0 |
| COMP-002 | Filtrer par prix, garanties, franchise, délai, assureur | P0 |
| COMP-003 | Trier par prix, couverture, popularité, rapidité | P0 |
| COMP-004 | Afficher score explicable | P1 |
| COMP-005 | Comparer 2 à 4 offres côte à côte | P1 |
| COMP-006 | Masquer offres non validées ou expirées | P0 |
| COMP-007 | Afficher mention “indicatif” | P0 |
| COMP-008 | Afficher partenaire responsable | P0 |
| COMP-009 | Permettre demande sur une ou plusieurs offres | P0 |
| COMP-010 | IA pour expliquer différences entre offres | P1 |

---

## 15. Scoring et recommandation

### Objectif

Aider l’utilisateur à comprendre quelle offre correspond à ses critères, sans conseil réglementé.

### Score configurable

| Critère | Poids par défaut |
|---|---:|
| Niveau de garantie | 30 % |
| Prix | 25 % |
| Franchise | 15 % |
| Rapidité de traitement | 10 % |
| Flexibilité de paiement | 10 % |
| Qualité des informations disponibles | 5 % |
| Préférences utilisateur | 5 % |

### Règles

- Le score est indicatif.
- Le scoring doit être explicable.
- L’utilisateur peut modifier les critères de tri.
- Les offres sponsorisées doivent être clairement identifiées.
- L’IA peut aider à résumer, mais ne doit pas imposer un choix.

---

## 16. Demande de devis

### Objectif

Collecter une demande structurée, exploitable et conforme.

### Étapes

1. Informations de base
2. Critères produit
3. Documents optionnels
4. Choix du partenaire ou routage automatique
5. Consentement de transmission
6. Résumé IA de la demande
7. Confirmation

### Champs génériques

- pays ;
- produit ;
- prénom ;
- nom ;
- téléphone ;
- email ;
- ville ;
- préférence de contact ;
- budget indicatif ;
- délai souhaité ;
- consentement ;
- source marketing ;
- langue préférée.

### Exigences

| ID | Exigence | Priorité |
|---|---|---|
| QUOTE-001 | Générer formulaire dynamique par produit | P0 |
| QUOTE-002 | Valider téléphone/email selon pays | P0 |
| QUOTE-003 | Collecter consentement explicite | P0 |
| QUOTE-004 | Permettre upload de documents | P1 |
| QUOTE-005 | Créer lead avec identifiant unique | P0 |
| QUOTE-006 | Détecter doublons | P0 |
| QUOTE-007 | Envoyer confirmation au prospect | P0 |
| QUOTE-008 | Afficher courtier destinataire si applicable | P0 |
| QUOTE-009 | Permettre demande multi-courtiers si consentie | P1 |
| QUOTE-010 | Journaliser toutes les étapes | P0 |
| QUOTE-011 | Générer résumé IA de la demande | P1 |
| QUOTE-012 | Détecter incohérences via IA | P1 |

---

## 17. Moteur de routage des leads

### Objectif

Envoyer chaque lead au bon courtier selon pays, produit, licence, disponibilité, contrat, quota et performance.

### Règles de contrôle

Le moteur vérifie :

1. pays actif ;
2. produit actif ;
3. courtier actif ;
4. courtier autorisé pour ce pays ;
5. courtier autorisé pour ce produit ;
6. licence valide ;
7. quota disponible ;
8. consentement utilisateur ;
9. règle commerciale ;
10. disponibilité ou SLA ;
11. statut du plan commercial ;
12. score qualité du lead.

### Modes de routage

| Mode | Description |
|---|---|
| Sélection utilisateur | L’utilisateur choisit le courtier/offre |
| Round-robin | Distribution équilibrée |
| Priorité commerciale | Courtier prioritaire selon contrat |
| Performance | Courtier avec meilleur taux de réponse |
| Capacité | Courtier avec quota disponible |
| Manuel | Admin assigne manuellement |
| Exclusif | Un seul courtier par pays/produit |
| Multi-envoi | Plusieurs courtiers reçoivent la demande si consentement explicite |
| IA assistée | IA suggère le meilleur routage, validation par règles métier |

### Exigences

| ID | Exigence | Priorité |
|---|---|---|
| ROUTE-001 | Configurer règles par pays/produit | P0 |
| ROUTE-002 | Exclure partenaire inactif ou non vérifié | P0 |
| ROUTE-003 | Gérer quotas mensuels | P0 |
| ROUTE-004 | Gérer règles de priorité | P1 |
| ROUTE-005 | Gérer round-robin | P1 |
| ROUTE-006 | Notifier courtier assigné | P0 |
| ROUTE-007 | Permettre réassignation admin | P0 |
| ROUTE-008 | Journaliser décision de routage | P0 |
| ROUTE-009 | Utiliser IA pour détecter mauvais routage potentiel | P1 |

---

## 18. Portail Starter courtier

### Objectif

Permettre au courtier Starter de recevoir et consulter les leads sans CRM complet.

### Fonctionnalités

- liste simple des leads reçus ;
- détail du lead ;
- bouton accepter ;
- bouton rejeter/contester ;
- statut minimal : nouveau, vu, accepté, rejeté, traité ;
- téléchargement des informations autorisées ;
- notification email ;
- historique minimal ;
- dashboard très simple.

### Restrictions

Le plan Starter n’inclut pas :

- Kanban ;
- pipeline avancé ;
- tâches ;
- rappels ;
- notes avancées ;
- assignation d’équipe ;
- reporting détaillé ;
- IA commerciale avancée.

---

## 19. CRM courtier Pro/Enterprise

### Objectif

Fournir aux courtiers Pro et Enterprise un outil complet pour transformer les leads en clients.

### Pipeline standard

1. Nouveau
2. Accepté
3. Contact tenté
4. Contacté
5. Qualifié
6. Documents demandés
7. Devis en préparation
8. Devis envoyé
9. Négociation
10. Gagné
11. Perdu
12. Doublon
13. Injoignable
14. Hors cible
15. Rejeté / contesté

### Fonctionnalités CRM

| ID | Fonctionnalité | Priorité |
|---|---|---|
| CRM-001 | Afficher leads assignés au courtier | P0 |
| CRM-002 | Filtrer par statut, produit, date, conseiller | P0 |
| CRM-003 | Changer statut du lead | P0 |
| CRM-004 | Ajouter notes internes | P0 |
| CRM-005 | Ajouter tâches et rappels | P0 |
| CRM-006 | Assigner lead à un conseiller | P0 |
| CRM-007 | Joindre documents | P1 |
| CRM-008 | Créer ou joindre devis | P1 |
| CRM-009 | Marquer gagné/perdu | P0 |
| CRM-010 | Export CSV selon permission | P1 |
| CRM-011 | Voir historique complet | P0 |
| CRM-012 | Contester un lead facturé | P1 |
| CRM-013 | Résumé IA du lead | P1 |
| CRM-014 | Suggestions IA de relance | P1 |
| CRM-015 | Score IA de priorité | P1 |

---

## 20. Dashboard courtier

### KPIs

| KPI | Description |
|---|---|
| Leads reçus | Nombre de leads sur période |
| Leads acceptés | Leads pris en charge |
| Taux de contact | Leads effectivement contactés |
| Délai moyen de premier contact | Temps entre assignation et premier contact |
| Taux de qualification | Leads qualifiés / leads reçus |
| Devis envoyés | Nombre de devis envoyés |
| Taux de conversion | Gagnés / leads reçus |
| Produits performants | Produits avec meilleure conversion |
| Sources performantes | SEO, campagne, direct, partenaire |
| Conseillers performants | Classement équipe |
| Leads contestés | Leads invalides ou doublons |
| Coût par lead | Selon plan |
| Analyse IA | Résumé automatique des performances |

### Exigences

| ID | Exigence | Priorité |
|---|---|---|
| DASH-B-001 | Afficher volume de leads | P0 |
| DASH-B-002 | Afficher pipeline par statut | P0 |
| DASH-B-003 | Afficher conversion par produit | P0 |
| DASH-B-004 | Afficher délai de réponse | P0 |
| DASH-B-005 | Exporter rapport | P1 |
| DASH-B-006 | Comparer périodes | P1 |
| DASH-B-007 | Dashboard par conseiller | P1 |
| DASH-B-008 | Afficher facturation/leads consommés | P1 |
| DASH-B-009 | Générer résumé IA de performance | P1 |

---

## 21. Dashboard admin plateforme

### Objectif

Piloter la marketplace, les partenaires, les pays, les produits, la performance et la conformité.

### KPIs admin

| KPI | Description |
|---|---|
| Visiteurs | Total trafic |
| Demandes créées | Nombre de demandes |
| Taux visite → demande | Conversion front |
| Leads routés | Leads envoyés aux partenaires |
| Leads non routés | Problèmes de couverture ou conformité |
| Partenaires actifs | Courtiers actifs |
| Pays actifs | Pays publics |
| Produits actifs | Produits publics |
| CA abonnement | Revenu récurrent |
| CA leads | Revenu variable |
| SLA courtier | Temps de réaction |
| Qualité leads | Taux de contestation |
| Alertes conformité | Licence expirée, produit suspendu |
| Offres expirées | Offres à mettre à jour |
| Synthèse IA | Résumé automatique de l’activité |

---

## 22. Gestion des partenaires courtiers

### Données courtier

- raison sociale ;
- nom commercial ;
- pays ;
- ville ;
- numéro d’agrément ;
- date d’expiration ;
- documents d’agrément ;
- produits autorisés ;
- assureurs partenaires ;
- contacts administratifs ;
- contacts commerciaux ;
- statut ;
- plan tarifaire ;
- quota de leads ;
- SLA attendu ;
- conditions contractuelles.

### Statuts partenaire

- Prospect
- En vérification
- Actif test
- Actif public
- Suspendu
- Expiré
- Résilié

### Exigences

| ID | Exigence | Priorité |
|---|---|---|
| PARTNER-001 | Créer compte courtier | P0 |
| PARTNER-002 | Charger documents d’agrément | P0 |
| PARTNER-003 | Définir pays et produits couverts | P0 |
| PARTNER-004 | Vérifier date d’expiration licence | P0 |
| PARTNER-005 | Bloquer routage si licence expirée | P0 |
| PARTNER-006 | Définir quota de leads | P0 |
| PARTNER-007 | Définir plan tarifaire | P1 |
| PARTNER-008 | Gérer utilisateurs du courtier | P0 |
| PARTNER-009 | Historiser changements | P0 |
| PARTNER-010 | IA pour alerter sur incohérences partenaire/licence | P1 |

---

## 23. Notifications

### Canaux

- email ;
- SMS ;
- WhatsApp ;
- notification in-app ;
- webhook API.

### Notifications visiteur

- confirmation de demande ;
- résumé de la demande ;
- rappel documents manquants ;
- confirmation de transmission au courtier ;
- message de satisfaction ;
- demande d’avis.

### Notifications courtier

- nouveau lead ;
- lead réassigné ;
- document reçu ;
- rappel tâche ;
- lead proche expiration ;
- quota atteint ;
- facture disponible ;
- résumé IA quotidien ou hebdomadaire.

### Notifications admin

- licence partenaire expirante ;
- offre expirée ;
- pays sans courtier actif ;
- pic de leads non routés ;
- taux de contestation élevé ;
- incident technique ;
- anomalie détectée par IA.

---

## 24. Facturation B2B

### Modèles disponibles

| Modèle | Description |
|---|---|
| Abonnement fixe | Paiement mensuel pour accès selon plan |
| Lead qualifié | Facturation par lead valide |
| Pack de leads | Crédit prépayé |
| Setup fee | Frais d’installation |
| API fee | Frais d’intégration |
| White label fee | Frais de marque blanche |
| Add-on IA | Accès aux fonctions IA avancées |
| Success fee | Désactivé en V1 |

### Lead facturable

Un lead est facturable si :

- téléphone ou email valide ;
- pays actif ;
- produit actif ;
- consentement collecté ;
- demande non doublon ;
- courtier assigné ;
- informations minimales complètes.

---

## 25. Modèle de données principal

| Entité | Description |
|---|---|
| Country | Pays, devise, langue, statut, règles locales |
| RegulatoryRegime | CIMA, hors CIMA, local, autre |
| ProductCategory | Auto, santé, voyage, entreprise, etc. |
| Product | Produit configurable par pays |
| Offer | Offre comparative |
| Partner | Courtier, assureur, autre partenaire |
| PartnerLicense | Agrément, pays, produits, date validité |
| PartnerUser | Utilisateur courtier |
| Prospect | Personne ou entreprise demandant un devis |
| QuoteRequest | Demande de devis |
| LeadAssignment | Affectation d’une demande à un courtier |
| ConsentRecord | Preuve de consentement |
| ActivityLog | Historique commercial du lead |
| Task | Tâche de relance |
| QuoteProposal | Devis ou proposition préparée par courtier |
| Document | Fichier joint |
| Notification | Message envoyé |
| BillingPlan | Plan tarifaire |
| Invoice | Facture |
| FeatureFlag | Activation module/pays/produit |
| AuditLog | Journal de conformité |
| RoutingRule | Règle de distribution |
| ScoringRule | Règle de scoring comparateur |
| AiInteraction | Trace des interactions IA |
| AiSuggestion | Suggestion IA générée |
| AiRiskFlag | Alerte IA sur lead/offre/partenaire |

---

## 26. Architecture technique recommandée

## 26.1 Stack cible

| Couche | Technologie recommandée |
|---|---|
| Frontend public | Next.js / React |
| Portail courtier | Next.js / React |
| Back-office admin | Next.js / React |
| Backend API | NestJS |
| Base de données | PostgreSQL |
| ORM | Prisma ou TypeORM |
| Cache | Redis |
| Queue jobs | BullMQ avec Redis |
| Sessions / rate limit | Redis |
| Feature flags | Table interne + cache Redis |
| Notifications | Email provider + SMS/WhatsApp provider |
| Stockage documents | S3 compatible |
| Recherche | PostgreSQL full-text puis Meilisearch si besoin |
| IA | Service IA interne connecté à provider LLM |
| Monitoring | Sentry, Grafana, Prometheus |
| Analytics | PostHog, Matomo ou outil interne |

---

## 26.2 Rôle de Redis

Redis doit être utilisé pour :

- cache des pays actifs ;
- cache des produits actifs ;
- cache des offres publiques ;
- cache des feature flags ;
- sessions si nécessaire ;
- rate limiting ;
- anti-spam ;
- files de traitement BullMQ ;
- notifications asynchrones ;
- tâches IA asynchrones ;
- détection rapide de doublons ;
- verrouillage temporaire lors du routage de leads ;
- stockage temporaire des OTP ou codes de validation.

---

## 26.3 Modules NestJS recommandés

```txt
src/
  auth/
  users/
  countries/
  regulatory-regimes/
  products/
  offers/
  partners/
  partner-licenses/
  quote-requests/
  leads/
  routing/
  broker-portal/
  broker-crm/
  dashboards/
  billing/
  notifications/
  documents/
  feature-flags/
  audit-logs/
  consent/
  ai/
  reports/
  admin/
  integrations/
  webhooks/
  common/
```

---

## 26.4 Services IA NestJS

```txt
ai/
  ai.module.ts
  ai.service.ts
  ai-provider.service.ts
  lead-summary.service.ts
  lead-scoring.service.ts
  duplicate-detection.service.ts
  offer-analysis.service.ts
  broker-assistant.service.ts
  admin-insights.service.ts
  prompt-template.service.ts
  ai-audit.service.ts
```

### Exigences IA backend

| ID | Exigence | Priorité |
|---|---|---|
| AI-001 | Centraliser les appels IA dans un module dédié | P0 |
| AI-002 | Journaliser prompt, résultat, utilisateur, contexte | P0 |
| AI-003 | Masquer ou minimiser les données personnelles envoyées au modèle | P0 |
| AI-004 | Permettre désactivation IA par pays/produit/partenaire | P0 |
| AI-005 | Exécuter traitements IA lourds en queue BullMQ | P1 |
| AI-006 | Mettre en cache certains résultats IA dans Redis | P1 |
| AI-007 | Ajouter validation humaine sur suggestions sensibles | P0 |
| AI-008 | Gérer coût et quotas IA par plan | P1 |

---

## 27. Architecture fonctionnelle

```txt
Front public
  ├── Pages pays
  ├── Pages produits
  ├── Comparateur
  ├── Assistant IA visiteur
  ├── Formulaire de devis
  └── Confirmation

Back-office plateforme
  ├── Pays
  ├── Produits
  ├── Offres
  ├── Partenaires
  ├── Licences
  ├── Routage
  ├── Feature flags
  ├── Facturation
  ├── IA & audits
  └── Audit logs

Portail courtier Starter
  ├── Leads reçus
  ├── Détail lead
  ├── Acceptation/rejet
  ├── Notifications
  └── Dashboard basique

CRM courtier Pro/Enterprise
  ├── Pipeline
  ├── Tâches
  ├── Notes
  ├── Documents
  ├── Devis
  ├── Assistant IA
  ├── Dashboard
  └── Utilisateurs

Services backend NestJS
  ├── Auth & RBAC
  ├── Catalog service
  ├── Quote request service
  ├── Routing engine
  ├── Notification service
  ├── Billing service
  ├── AI service
  ├── Audit service
  ├── Reporting service
  └── API/Webhooks
```

---

## 28. API minimale

## 28.1 API publique

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/countries` | Liste pays publics |
| GET | `/countries/:code` | Détail pays |
| GET | `/products?country=CI` | Produits actifs par pays |
| GET | `/offers?country=CI&product=auto` | Offres comparables |
| POST | `/quote-requests` | Création demande devis |
| POST | `/quote-requests/:id/documents` | Upload document |
| GET | `/quote-requests/:id/status` | Statut minimal côté visiteur |
| POST | `/ai/visitor/product-assistant` | Assistant IA d’orientation produit |
| POST | `/ai/visitor/summarize-request` | Résumé IA avant soumission |

## 28.2 API courtier Starter

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/broker-starter/leads` | Liste simple des leads |
| GET | `/broker-starter/leads/:id` | Détail lead |
| POST | `/broker-starter/leads/:id/accept` | Accepter lead |
| POST | `/broker-starter/leads/:id/reject` | Rejeter/contester lead |
| GET | `/broker-starter/dashboard` | Dashboard basique |

## 28.3 API courtier Pro/Enterprise

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/broker/leads` | Liste leads |
| GET | `/broker/leads/:id` | Détail lead |
| PATCH | `/broker/leads/:id/status` | Mise à jour statut |
| POST | `/broker/leads/:id/notes` | Ajouter note |
| POST | `/broker/leads/:id/tasks` | Ajouter tâche |
| POST | `/broker/leads/:id/quotes` | Ajouter devis |
| POST | `/broker/leads/:id/dispute` | Contester lead |
| GET | `/broker/dashboard` | KPIs courtier |
| POST | `/ai/broker/leads/:id/summary` | Résumé IA lead |
| POST | `/ai/broker/leads/:id/next-action` | Suggestion prochaine action |
| POST | `/ai/broker/leads/:id/follow-up-message` | Message de relance IA |

## 28.4 API admin

| Méthode | Endpoint | Description |
|---|---|---|
| CRUD | `/admin/countries` | Gestion pays |
| CRUD | `/admin/products` | Gestion produits |
| CRUD | `/admin/offers` | Gestion offres |
| CRUD | `/admin/partners` | Gestion partenaires |
| CRUD | `/admin/routing-rules` | Règles routage |
| CRUD | `/admin/feature-flags` | Activation modules |
| GET | `/admin/audit-logs` | Audit |
| GET | `/admin/reports` | Reporting |
| CRUD | `/admin/billing` | Facturation |
| GET | `/admin/ai-insights` | Synthèses IA admin |

---

## 29. Rôles et permissions

| Rôle | Permissions principales |
|---|---|
| Super Admin | Accès total plateforme |
| Admin Pays | Gérer pays, produits, partenaires locaux |
| Compliance Admin | Valider licences, textes, audits |
| Support Admin | Voir leads, aider utilisateurs, pas modifier règles critiques |
| Broker Owner Starter | Voir leads Starter, accepter/rejeter, dashboard simple |
| Broker Owner Pro | Gérer compte courtier, utilisateurs, CRM, facturation |
| Broker Manager | Voir tous les leads du courtier, assigner, dashboards |
| Broker Agent | Traiter les leads assignés |
| Broker Read-only | Voir rapports sans modification |
| Finance Admin | Facturation, plans, paiements B2B |
| Content Admin | CMS, pages, FAQ |
| AI Admin | Configurer prompts, quotas et modules IA |

### Règles critiques

- Un courtier ne voit que ses propres leads.
- Un courtier Starter ne voit pas les fonctionnalités CRM Pro.
- Un conseiller ne voit que les leads autorisés.
- Les exports sont limités aux rôles autorisés.
- Les données personnelles ne sont jamais visibles par un partenaire non assigné.
- Toutes les actions sensibles sont journalisées.

---

## 30. Sécurité et conformité

| Exigence | Niveau |
|---|---|
| HTTPS obligatoire | P0 |
| Chiffrement données sensibles au repos | P0 |
| RBAC strict | P0 |
| MFA pour admins et courtiers | P0 |
| Journalisation actions sensibles | P0 |
| Protection anti-spam / anti-bot | P0 |
| Scan antivirus documents | P1 |
| Rate limiting API avec Redis | P0 |
| Masquage PII dans logs techniques | P0 |
| Sauvegardes automatiques | P0 |
| Audit des interactions IA | P0 |
| Contrôle d’accès aux fonctions IA | P0 |
| Anonymisation/minimisation avant IA | P0 |

---

## 31. Traçabilité

Événements à journaliser :

- création lead ;
- consentement donné ;
- consentement retiré ;
- lead transmis ;
- lead consulté par courtier ;
- statut modifié ;
- document uploadé ;
- devis ajouté ;
- offre publiée ;
- offre modifiée ;
- licence partenaire modifiée ;
- pays activé/désactivé ;
- produit activé/désactivé ;
- export de données ;
- suppression/anonymisation ;
- suggestion IA générée ;
- suggestion IA acceptée/refusée ;
- prompt IA sensible exécuté ;
- routage assisté par IA.

---

## 32. Critères d’acceptation clés

## 32.1 Starter sans CRM

**Given** un courtier avec plan Starter  
**When** il se connecte  
**Then** il accède seulement à la liste simple des leads, au détail, aux actions accepter/rejeter et au dashboard basique, sans CRM Kanban ni pipeline avancé.

## 32.2 Pro avec CRM

**Given** un courtier avec plan Pro  
**When** il se connecte  
**Then** il accède au CRM complet, au pipeline, aux tâches, aux notes, aux assignations et aux fonctions IA prévues dans son plan.

## 32.3 Pays désactivé

**Given** un pays créé mais non public  
**When** un visiteur le sélectionne  
**Then** le système affiche une page d’attente et ne permet pas de demande de devis.

## 32.4 Produit désactivé

**Given** un produit désactivé dans un pays actif  
**When** un visiteur consulte ce produit  
**Then** le produit ne doit pas apparaître dans le parcours public.

## 32.5 Absence de consentement

**Given** un utilisateur remplit un formulaire  
**When** il ne coche pas le consentement de transmission  
**Then** aucun lead ne doit être transmis au courtier.

## 32.6 Courtier non autorisé

**Given** un courtier sans licence valide pour le pays ou produit  
**When** le moteur de routage cherche un partenaire  
**Then** ce courtier doit être exclu.

## 32.7 IA désactivée

**Given** l’IA désactivée pour un pays ou produit  
**When** un utilisateur ou courtier utilise ce module  
**Then** aucune fonctionnalité IA ne doit être proposée ni appelée.

## 32.8 Suggestion IA sensible

**Given** une suggestion IA liée à une offre, un routage ou une conformité  
**When** la suggestion est générée  
**Then** elle doit être marquée comme assistance et ne doit pas s’appliquer automatiquement sans règle métier ou validation humaine.

---

## 33. Roadmap de livraison

## Phase 0 — Cadrage et conformité

Livrables :

- validation juridique du positionnement ;
- modèle de contrat partenaire technique ;
- accord de traitement des données ;
- charte de contenu offre ;
- sélection pays pilote ;
- sélection produits pilotes ;
- wireframes principaux ;
- architecture NestJS ;
- schéma PostgreSQL ;
- stratégie Redis ;
- stratégie IA et garde-fous.

## Phase 1 — Socle plateforme

Livrables :

- auth ;
- RBAC ;
- back-office admin ;
- catalogue pays ;
- catalogue produits ;
- feature flags ;
- gestion partenaires ;
- gestion licences ;
- audit logs ;
- Redis cache ;
- BullMQ ;
- CMS basique ;
- pages publiques simples.

## Phase 2 — Comparateur + demande de devis

Livrables :

- moteur d’offres ;
- comparateur ;
- formulaires dynamiques ;
- consentements ;
- création lead ;
- confirmation utilisateur ;
- notifications ;
- anti-spam ;
- détection doublon ;
- résumé IA de demande ;
- assistant IA de formulaire limité.

## Phase 3 — Portail Starter + CRM Pro

Livrables :

- portail Starter sans CRM ;
- CRM Pro ;
- pipeline leads ;
- notes ;
- tâches ;
- assignation interne ;
- documents ;
- statuts ;
- historique ;
- exports contrôlés ;
- résumé IA lead ;
- suggestions IA de relance.

## Phase 4 — Dashboards et facturation

Livrables :

- dashboard Starter basique ;
- dashboard Pro ;
- dashboard admin ;
- plans partenaires ;
- quotas ;
- lead billing ;
- contestation lead ;
- rapports ;
- synthèse IA des performances.

## Phase 5 — API, automatisations et IA avancée

Livrables :

- API partenaires ;
- webhooks ;
- intégration CRM externe ;
- SMS/WhatsApp ;
- scoring avancé ;
- routage assisté IA ;
- analyse documents ;
- white label.

## Phase 6 — Modules réglementés futurs

À activer uniquement après validation juridique et partenariale :

- paiement prime ;
- signature électronique ;
- émission attestation ;
- émission police ;
- intégration assureur ;
- suivi sinistre ;
- espace client complet.

---

## 34. Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Requalification en courtier | Très élevé | Positionnement partenaire technique, pas de vente directe, contrats avec courtiers agréés |
| Courtier non conforme | Élevé | Vérification licence, expiration, blocage routage |
| Starter trop limité | Moyen | Upsell clair vers Pro, mais valeur minimale via leads et notifications |
| Informations offres obsolètes | Élevé | Versioning, date validité, validation partenaire, alertes IA |
| Violation données personnelles | Élevé | Consentement, chiffrement, RBAC, audit, minimisation |
| IA donne un conseil réglementé | Élevé | Prompts encadrés, disclaimers, validation humaine, désactivation possible |
| Faible réactivité courtier | Moyen | SLA, dashboard, suspension si mauvaise performance |
| Leads de mauvaise qualité | Moyen | Anti-spam, validation téléphone, scoring IA, contestation |
| Trop de pays au départ | Élevé | Pays créés mais désactivés ; activation progressive |
| Produit santé trop sensible | Élevé | Limiter données santé en V1 |
| Classement contesté | Moyen | Score transparent, mention sponsorisé |
| Facturation contestée | Moyen | Définition claire lead qualifié, preuve d’événements |

---

## 35. Checklist d’activation d’un pays

Un pays ne peut passer en public que si :

- au moins un courtier partenaire est actif ;
- la licence du courtier est renseignée ;
- les produits publics sont validés ;
- les offres sont validées ou le formulaire générique est activé ;
- les textes légaux pays sont remplis ;
- les règles de routage sont configurées ;
- le consentement pays est configuré ;
- les notifications sont testées ;
- le support sait traiter les demandes ;
- un admin conformité a validé l’ouverture ;
- un plan de désactivation rapide existe ;
- les modules IA autorisés sont explicitement activés ou désactivés.

---

## 36. Checklist d’activation d’un produit

Un produit ne peut passer en public que si :

- le formulaire dynamique est complet ;
- les champs obligatoires sont définis ;
- les documents requis sont définis ;
- les partenaires traitant ce produit sont actifs ;
- les règles de scoring sont définies ;
- les disclaimers produit sont configurés ;
- les offres sont validées ou le mode demande générique est activé ;
- le routage est testé ;
- le parcours utilisateur est testé ;
- le dashboard remonte les métriques ;
- les garde-fous IA du produit sont configurés.

---

## 37. Version MVP recommandée

Même si la base contient tous les pays et produits, le lancement public devrait être limité à :

- 1 pays ;
- 2 produits maximum ;
- 3 à 5 courtiers ;
- formulaire de devis ;
- comparateur indicatif ;
- portail Starter ;
- CRM Pro pour partenaires payants ;
- dashboard simple ;
- IA limitée au résumé et à la qualification ;
- pas de paiement ;
- pas d’émission ;
- pas de signature ;
- pas de sinistre.

---

## 38. Indicateurs de succès

## 38.1 Produit

| KPI | Objectif initial |
|---|---:|
| Taux visite → demande | 3 % à 8 % |
| Taux formulaire complété | > 40 % |
| Délai premier contact courtier | < 4 h, cible < 30 min |
| Taux leads valides | > 70 % |
| Taux contestation leads | < 15 % |
| Taux devis envoyés | > 30 % |
| Taux conversion lead → client | À mesurer par produit |

## 38.2 Business

| KPI | Objectif |
|---|---:|
| Courtiers actifs | 3 à 5 au pilote |
| Leads mensuels | 100 à 500 selon marché |
| Revenu récurrent | Abonnement + leads |
| Taux conversion Starter → Pro | À suivre |
| Churn courtier | Faible |
| Coût acquisition visiteur | À mesurer |
| Marge par lead | Positive après marketing |

## 38.3 IA

| KPI | Objectif |
|---|---:|
| Résumés IA utiles | > 80 % validés par utilisateurs internes |
| Suggestions IA utilisées | À mesurer |
| Taux doublons détectés | À mesurer |
| Coût IA par lead | Sous seuil défini |
| Incidents IA sensibles | 0 critique |

## 38.4 Conformité

| KPI | Objectif |
|---|---:|
| Leads sans consentement transmis | 0 |
| Partenaires expirés recevant leads | 0 |
| Offres expirées publiques | 0 |
| Actions critiques non auditées | 0 |
| Exports non autorisés | 0 |
| Suggestions IA appliquées sans contrôle | 0 |

---

## 39. Formulations recommandées

À utiliser :

- “Comparer les offres”
- “Demander un devis”
- “Être rappelé par un courtier agréé”
- “Offre indicative”
- “Prix à confirmer”
- “Selon vos critères”
- “Partenaire responsable”
- “Courtier partenaire”
- “Assistant IA d’aide à la compréhension”

À éviter :

- “Acheter maintenant”
- “Souscrire maintenant”
- “Nous vous assurons”
- “Votre contrat est validé”
- “La meilleure assurance du marché”
- “Garantie acceptée”
- “Police émise”
- “Paiement de prime”
- “L’IA vous recommande officiellement ce contrat”

---

## 40. Conclusion

La plateforme doit être pensée comme une **infrastructure technique pour courtiers agréés**.

La bonne stratégie est :

> **Construire large, activer petit, automatiser intelligemment avec l’IA, mais laisser le courtier agréé responsable du conseil et de la souscription.**

Les décisions structurantes de cette version sont :

1. le plan Starter ne contient pas de CRM ;
2. le CRM est réservé aux plans Pro et Enterprise ;
3. l’IA est intégrée partout où elle apporte de la valeur, mais avec des garde-fous ;
4. le backend cible est NestJS ;
5. Redis est utilisé pour cache, queues, rate limiting, anti-spam, feature flags et traitements asynchrones ;
6. les modules réglementés comme paiement, émission et sinistres restent désactivés au départ.

