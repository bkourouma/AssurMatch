# Dossier éditorial et UX : site public AssurMatch

Livrable de la spec 050 (`../spec.md`). Il réécrit tous les contenus et l'expérience du site public
(Côte d'Ivoire d'abord ; Sénégal, Mali et Guinée annoncés avec une liste d'attente), sans changer le métier : comparaison indicative et mise en
relation avec des courtiers autorisés.

## Ordre de lecture

| Fichier | Contenu | Pages |
| --- | --- | --- |
| `00-charte-editoriale.md` | Voix, règles de rédaction, vocabulaire interdit, 4 phrases de positionnement, libellés d'action, inventaire des données, marqueurs | à lire en premier |
| `01-accueil-pays-produits.md` | Arborescence FR/EN ; accueil ; liste des pays ; page pays ouverte (CI, SN) et liste d'attente ; pages produit auto et voyage × CI et SN, plus un gabarit générique | 5 |
| `02-offres-comparaison-devis.md` | Liste des offres, filtres, tri, anatomie de la carte d'offre (2 cartes remplies) ; détail ; comparaison bureau et mobile ; devis en 4 étapes ; confirmation et suivi | 5 |
| `03-guides-faq-lexique.md` | Index et gabarit des guides ; texte complet de 7 guides (dont 3 nouveaux : franchise, responsabilité civile, sinistre) ; FAQ en 18 questions et 4 thèmes ; lexique de 40 termes | 4 + 7 guides |
| `04-confiance-legal.md` | Comment ça marche ; statut réglementaire ; **Notre engagement** (nouvelle) ; confidentialité ; cookies ; CGU ; mentions légales ; contact | 8 |
| `05-espace-courtiers.md` | Devenir partenaire ; formules et tarifs ; candidature en 4 étapes ; confirmation (nouvelle) ; connexion ; annuaires courtiers et assureurs, fiche courtier | 8 |
| `06-composants-etats-accessibilite.md` | En-tête, pied de page, sélecteurs ; catalogue de 14 composants ; 16 états d'interface avec leur texte exact ; accessibilité WCAG 2.1 AA ; glossaire des microcopies ; règles de dérivation EN | transversal |

## Décisions (validées le 2026-09-25 : 1 et 2 validées, 3 = « partenaire »)

1. **Mot « IA »** (spec D2). Il disparaît des titres et des arguments, mais reste dans l'étiquette de
   transparence de l'assistant (« Réponse générée automatiquement par un outil d'IA. Aide à la
   lecture, pas un conseil. ») parce que la constitution (V) impose ce marquage.
2. **Signature de marque** (spec D3). « Le bon courtier, pour un meilleur avenir » est remplacée par
   « Comparer d'abord. Être accompagné ensuite. », à valider par la marque.
3. **Libellé de rappel.** La charte retient « Être rappelé par un courtier agréé » ; le code affiche
   aujourd'hui « … courtier partenaire ». Le test accepte les deux. Choisir un seul libellé.
4. **Tri par défaut** : le score (la page le fixe, le schéma partagé ne change pas). « Sponsorisées
   d'abord » et « nom » quittent l'interface visiteur.
5. **Courtier nommé avant consentement** (spec D4) : oui quand une offre est présélectionnée, avec
   une recherche par nom commercial dans l'annuaire. Sinon, on explique qui recevra la demande.
6. **Candidature courtier** : la relecture est intégrée à l'étape 4 (et non une 5ᵉ étape). La
   référence est transmise à la page de confirmation par paramètre d'URL (référence publique
   uniquement).
7. **Guides** : temps de lecture calculé à 200 mots par minute ; les 3 nouveaux guides sont
   transversaux (sans produit) ; pas d'onglets par produit tant que moins de 3 guides partagent un
   produit.
8. **Anglais** : choisir une seule convention pour « licence/license » et « franchise → deductible
   ou excess » (voir `06`, section 6).

## Informations à fournir (`[à confirmer]`)

- **Société** : raison sociale, RCCM, siège, directeur ou directrice de la publication, hébergeur,
  contact protection des données, droit applicable.
- **Données personnelles** : durées de conservation par catégorie, procédure en cas d'incident,
  chiffrement au repos.
- **Réglementaire** : autorité de contrôle par pays, autorité qui délivre l'agrément des courtiers.
- **Contact local** : numéro WhatsApp et adresse physique par pays.
- **Courtiers** : facturation d'un lead refusé, pause d'abonnement, exclusivité, détail du SLA et
  des fonctions Enterprise.
- **Délais** : aucun délai de réponse (courtier, contact, réclamation) n'est affiché tant qu'aucune
  mesure réelle n'existe.

## Points à faire relire par un juriste (`[à vérifier juridiquement]`)

Obligation de la RC automobile et cadre CIMA ; carte brune CEDEAO ; exigences d'assurance du visa
Schengen ; délais de déclaration de sinistre ; règles de calcul des franchises ; base légale du
traitement des données ; limites de responsabilité et juridiction des CGU ; formulation du rôle
d'AssurMatch dans les mentions légales. Environ 50 occurrences, chacune marquée dans le texte.

## Suivis hors de cette spec (backend)

`validUntil` sur la carte d'offre ; motif d'indisponibilité d'une offre (expirée, non validée,
courtier non éligible) ; identifiant du partenaire dans le résumé d'offre. Détail dans `../spec.md`.

## Suite

Après validation de la spec et des décisions ci-dessus : `/speckit.plan`, puis `/speckit.tasks`,
puis une implémentation en vagues (un rédacteur par surface : catalogues `messages/*.json`, modules
`app/content/*.ts`, composants et pages, garde-fous CI), avec `npm run typecheck`, `npm run lint`,
`npm run test`, `next build` d'`apps/public` et `npm run test:web:local` en validation.
