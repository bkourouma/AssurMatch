# 00 — Charte éditoriale et règles communes

Ce fichier fait référence pour tous les autres fichiers de `content/`. En cas de doute, il l'emporte
sur le style, et la constitution (`.specify/memory/constitution.md`) l'emporte sur lui.

## 1. Qui parle

Une petite équipe basée à Abidjan et à Dakar, qui connaît l'assurance et qui a vu des gens se faire
refuser un sinistre faute d'avoir lu leur contrat. Elle ne vend rien au visiteur. Elle lui montre ce
qui existe, elle lui explique ce qu'il regarde et elle le met en relation avec un courtier autorisé
qui, lui, engage sa responsabilité professionnelle.

La voix est celle d'une personne compétente qui parle à un adulte : précise, calme et honnête sur ce
qu'elle ne sait pas.

## 2. Règles de rédaction

1. **Vouvoiement** partout, y compris dans l'espace courtiers.
2. **Phrases courtes.** Une idée par phrase. Au-delà de 20 mots, couper.
3. **Du concret avant l'abstrait.** « la carte grise et le permis du conducteur principal » plutôt que
   « les documents nécessaires ». « 45 000 FCFA par an » plutôt que « un prix compétitif ».
4. **Une limite vaut mieux qu'une promesse.** Dire ce qui n'est pas couvert, ce qui n'est pas connu et
   ce qui reste à confirmer.
5. **Un seul objectif par page**, un appel à l'action principal cohérent avec cet objectif, au plus un
   appel secondaire.
6. **Le français standard tel qu'on l'écrit en Afrique de l'Ouest**, sans folklore ni expressions
   plaquées : « FCFA », « carte grise », « attestation d'assurance », « carte brune CEDEAO »,
   « Mobile Money », « visa Schengen », « agence », « quartier ». Pas de « nouchi » ni de wolof
   décoratif, pas d'images d'Épinal.
7. **Montants** : `45 000 FCFA` (espace fine insécable dans l'implémentation, FCFA après le nombre).
   Les montants réels viennent toujours de l'API. Tout montant écrit dans une maquette de texte est
   marqué `[exemple]`.
8. **Dates** : `24 septembre 2026`. Jamais « récemment », « bientôt » ni « dans les prochains jours ».
9. **Majuscules** : seulement en début de phrase et pour les noms propres. Titres en casse de phrase.
10. **Ponctuation** : les deux-points et les points-virgules sont préférés au tiret long ; au plus un
    tiret long par page. Pas de point d'exclamation, sauf dans une citation.
11. **Pas de liste de trois pour faire rythmer.** Une énumération contient le nombre d'éléments qui
    existent réellement.

## 3. Vocabulaire interdit

Interdits par la constitution (bloquants, vérifiés en CI) : « acheter », « acheter maintenant »,
« souscrire maintenant », « contrat valide », « garantie acceptée », « la meilleure assurance du
marché », et tout équivalent qui laisse croire qu'AssurMatch prend une décision réglementée.

Interdits par cette spec (à ajouter au garde-fou CI) :

| Interdit | Pourquoi | À la place |
| --- | --- | --- |
| révolutionnaire, innovant, disruptif | creux | décrire ce qui change concrètement |
| meilleur, meilleure, le top, n°1, leader | superlatif invérifiable | « le prix le plus bas parmi les offres affichées » |
| garanti, garantie de (au sens promesse) | promesse impossible | « le courtier confirme », « à confirmer » ; le **nom** « garantie » (couverture) reste autorisé |
| instantané, immédiat, en temps réel, en quelques clics, en un clic | promesse de délai | « le formulaire prend environ 3 minutes `[à mesurer]` » |
| intelligence artificielle, IA, algorithme intelligent (en argument commercial) | voir la décision D2 de `spec.md` | « l'assistant de lecture » dans le texte, étiquette de transparence conservée sur la fonction |
| solution, écosystème, expérience unique, parcours fluide, sans tracas, simple comme bonjour | jargon marketing | le verbe concret |
| n'hésitez pas, nous sommes ravis, découvrez, boostez, profitez | formules toutes faites | l'action directe : « Écrivez-nous », « Comparez » |
| gratuit **sans précision** | ambigu | « Vous ne payez rien à AssurMatch. Le prix de l'assurance est fixé par l'assureur et confirmé par le courtier. » |
| partenaire officiel, agréé par AssurMatch | AssurMatch n'agrée personne | « courtier autorisé par [autorité à confirmer] » |

## 4. Les quatre phrases de positionnement

Elles reviennent partout où une décision est prise (accueil, fiche offre, consentement,
confirmation). Elles peuvent être raccourcies mais pas contredites.

- **Courte** (bandeau, pied de carte) :
  « Offre indicative. Le prix et les conditions sont confirmés par le courtier partenaire. »
- **Moyenne** (accueil, pages produit) :
  « AssurMatch compare des offres indicatives et vous met en relation avec un courtier autorisé.
  Nous ne vendons pas d'assurance, nous ne signons pas de contrat et nous ne recevons pas votre
  prime. »
- **Rémunération** :
  « Vous ne payez rien à AssurMatch. Ce sont les courtiers partenaires qui paient un abonnement ou
  les demandes qu'ils reçoivent. »
- **Transmission** (avant tout consentement) :
  « Rien n'est transmis tant que vous n'avez pas coché la case de consentement et envoyé votre
  demande. »

## 5. Libellés d'action normalisés

| Contexte | Libellé exact |
| --- | --- |
| Aller aux offres | Comparer les offres |
| Formulaire de devis | Demander un devis |
| Rappel | Être rappelé par un courtier partenaire |
| Carte d'offre | Voir le détail |
| Sélection | Ajouter à la comparaison / Retirer de la comparaison |
| Comparaison | Comparer la sélection (2 à 4 offres) |
| Étape suivante d'un formulaire | Continuer |
| Retour | Revenir à l'étape précédente |
| Vérification | Vérifier ma demande |
| Envoi final | Envoyer ma demande |
| Courtier | Devenir partenaire / Voir les formules / Envoyer ma candidature / Se connecter à l'espace courtier |
| Réinitialiser des filtres | Effacer les filtres |

Ces libellés sont protégés par `public-localized-wording.spec.ts` pour les trois premiers.

## 6. Données : ce qui existe, ce qui manque

Ce que l'API fournit déjà et qu'on peut afficher sans rien inventer (contrat
`packages/shared/contracts/quote.contracts.ts`) : nom de l'offre, assureur, courtier responsable,
prix indicatif, franchise, plafond, délai de traitement, souplesse de paiement, garanties incluses et
exclues, résumé des exclusions, score sur 100 avec détail par critère (niveau de garantie, prix,
franchise, rapidité, souplesse de paiement, qualité de l'information, préférence du visiteur),
sponsorisation, date de mise à jour, date de fin de validité, popularité, documents requis, mentions
du partenaire, compteurs publics (pays ouverts, courtiers actifs, offres validées), tarifs des
formules courtiers par pays.

Ce qui **n'existe pas** et doit rester marqué `[à confirmer]` tant qu'une source réelle n'existe pas :

- délai de réponse moyen d'un courtier ;
- nombre de demandes traitées, taux de satisfaction, économies moyennes ;
- témoignages (aucun n'est vérifié : le composant existe dans le système mais n'est pas affiché) ;
- raison sociale, RCCM, siège, directeur de publication, hébergeur d'AssurMatch ;
- numéro d'agrément et autorité de tutelle de chaque pays (les faits CIMA sont marqués
  `[à vérifier juridiquement]`) ;
- numéro WhatsApp et adresse physique par pays ;
- durée réelle de remplissage du formulaire (`[à mesurer]`).

## 7. Marqueurs

- `[à confirmer]` : information métier manquante, à fournir par l'équipe.
- `[à vérifier juridiquement]` : fait réglementaire plausible qui doit être relu par un juriste.
- `[à mesurer]` : durée ou chiffre qui doit venir d'une mesure réelle.
- `[exemple]` : valeur d'illustration, jamais affichée comme donnée réelle.
- `{variable}` : valeur injectée à l'exécution (ex. `{country}`, `{product}`, `{count}`).

## 8. Format attendu de chaque fiche de page

```
## <Nom de la page>
- Route FR / EN :
- Objectif prioritaire (une phrase) :
- Appel à l'action principal / secondaire :
- Namespace i18n existant : (ex. `Home.*`) — ou « nouveau »
- Statut : réécriture | restructuration | nouvelle page

### Structure (dans l'ordre)
1. <Bloc> — composant : <nom>
   - Kicker :
   - Titre :
   - Sous-titre :
   - Corps / microcopie :
   - Boutons :
   - Données affichées (source) :
   - États : vide / chargement / erreur / …

### Notes d'implémentation
- ce qui change par rapport à l'existant, avec `fichier:ligne` ;
- chaînes protégées par un test (à garder mot pour mot) ;
- éléments `[à confirmer]`.
```

Le livrable est écrit en français. La version anglaise sera dérivée à l'implémentation, clé par
clé, avec les mêmes règles (pas de superlatif, pas de promesse de délai, « indicative offer »,
« to be confirmed by the partner broker »).
