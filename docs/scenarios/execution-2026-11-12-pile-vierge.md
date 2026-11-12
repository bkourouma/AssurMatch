# Rapport d'exécution — parcours E2E AssurMatch (pile locale vierge)

Archive du 2026-11-12. Rapport de l'exécution manuelle, dans le navigateur, du scénario de référence [`e2e-parcours-complet.md`](e2e-parcours-complet.md), qui reste la seule référence : le présent fichier en est le compte rendu daté et n'est pas à tenir à jour (voir la section 16.5 du scénario). Contenu repris tel quel du rapport d'origine, sous l'encadré ci-dessous.

> **Suite donnée**
>
> - **Corrigés par la PR qui suivra le lot de correctifs en cours** : points 6, 7, 3 (côté courtier), 8, 11, 12, 13, 14, 15, 16, 17 et 20 de la section 3.
> - **En attente de décision du propriétaire** : point 3 (côté Admin : fiche prospect en clair après retrait de consentement) et point 4 (effacement clôturé « Traitée » sans lot exécuté).
> - **Conservé tel quel** : point 5, message « Cette adresse e-mail est déjà utilisée. » côté Admin (hypothèse H-Admin) ; point 2, rotation des jetons de suivi (hypothèse H25).
> - **Reportés dans le scénario de référence** (section 3 du rapport, points 1, 9, 10, 18 et 19 ; la liste de la section 4 devient la section 16.5 du scénario) : revue manuelle jouée, validations natives du navigateur (H27), libellés réels, prérequis P0 (préfixe et longueur du téléphone, régime réglementaire, assureurs, produit voyage, checklist de 10 contrôles).

---

Exécution dans le navigateur du scénario `e2e-parcours-complet.md`, le 12/11/2026, sur une pile locale sans seed (Admin 47602, Courtier 47603, Public 47601, API 47600, Mailpit 47825). Suffixe de données : `c8qbr`. Le journal brut, cas par cas, est dans `journal-e2e-intermediaire.md`.

## 1. Synthèse

Le parcours nominal complet a pu être joué de bout en bout : intégration du courtier (candidature, conversion, licence, contrat, utilisateurs), offres (création, validation, refus, suspension), ouverture du pays et du produit, demande de devis visiteur, revue manuelle, lead (acceptation, proposition, messagerie, documents, clôture), retrait de consentement, demande d'effacement, suspension et réactivation du courtier.

Sur les cas jouables, la grande majorité est conforme à l'attendu, souvent au mot près. Les écarts sont surtout des libellés différents, des validations natives du navigateur à la place de messages serveur, et quelques points de comportement à arbitrer côté produit (section 3). Deux familles de cas n'ont pas pu être jouées pour des raisons structurelles : la facturation et l'enquête de satisfaction (aucun interrupteur d'activation dans l'interface) et le responsive 375 px (viewport non modifiable avec l'outillage).

Cinq défauts trouvés en début de campagne ont été corrigés par le lot de correctifs (PR #56) puis revérifiés : crash de la création de règle de scoring, 503 à l'envoi de la candidature depuis le formulaire public, message de motif trompeur (périmètre et nom court), mode de routage par défaut, doublon d'e-mail à l'invitation d'un courtier devenu neutre.

## 2. Résultats par phase

Légende : OK = conforme ; OK* = conforme avec écart de libellé ou de forme ; PARTIEL = joué en partie ; NJ = non jouable ou non joué (raison en section 4).

### Phase 0 — Plateforme

| Cas | Résultat | Remarque |
|---|---|---|
| P0-01 | OK | Enrôlement MFA du super admin, secret et 8 codes de secours. Le premier passage (connexion initiale) n'a pas pu être rejoué : session déjà ouverte au départ |
| P0-02, E-P0-02a | OK / OK* | Flags comparateur et devis activés ; motif de 7 car. refusé par un message applicatif et non par le champ |
| E-P0-02b | PARTIEL | Aucun bouton pour billing, IA, satisfaction, multi-courtiers (« Aucune activation par cette interface ») ; rejeu par PATCH direct non fait |
| P0-03, E-P0-03a | OK | Consentement FR et EN publiés ; texte sans `{{brokerName}}` refusé avec les 2 lignes attendues |
| P0-04, E-P0-04a | OK | Formulaires FR et EN ; « Acheter maintenant » refusé. Produit voyage inexistant en base vierge |
| P0-06, E-P0-05, E-P0-06a | OK | Attestations pays et produit, statut du pays, refus tant que le produit n'est pas public |
| P0-07, E-P0-07a, E-P0-07b | OK / OK* | Comptes CA, FA, AP, SU créés ; seul CA activé. Doublon d'e-mail : « Cette adresse e-mail est déjà utilisée. » (le scénario attend un message générique) |
| E-P0-01a (courtier), E-P0-01g | OK / PARTIEL | « Identifiants invalides. » ; expiration de session à 15 min observée, URL exacte de redirection non relevée |

### Phase 1 — Candidature et intégration

| Cas | Résultat | Remarque |
|---|---|---|
| E-P1-01a à E-P1-01e, E-P1-01g | OK | Messages conformes. Après correctif, la candidature passe et le doublon renvoie la même référence PA-… |
| P1-01 | OK après correctif | 503 systématique avant correctif (origine du port public) |
| P1-02, P1-03, P1-04 | OK | « 5 condition(s) non remplie(s) » au lieu de 6 (la 6e est déjà remplie : pays ouvert à l'inscription) |
| E-P1-05a à E-P1-05c, P1-05 | OK / OK* | Type refusé, 5 Mo + 1, EICAR placé en quarantaine ; le message « ni accepté ni téléchargé » n'est pas atteignable (l'interface n'offre que « Refuser ») |
| P1-06 à P1-10, E-P1-08a | OK | Licence, contrat v1, invitation du propriétaire, statuts Prospect → En vérification → Actif public |
| E-P1-09a, E-P1-09b | OK* / OK après correctif | Doublon : message explicite ; nom d'1 caractère : message correct après correctif |

### Phase 2 — Courtier

| Cas | Résultat | Remarque |
|---|---|---|
| P2-01, P2-02 | OK | Activation puis MFA du propriétaire |
| E-P2-01b | OK (mieux que le scénario) | Mot de passe faible : message lisible « Ce mot de passe ne respecte pas la politique de sécurité… » |
| E-P2-02a | OK | « Code de vérification incorrect. » |
| P2-04, E-P2-04a | OK | Profil mis à jour ; WhatsApp invalide refusé |
| P2-06 | OK | Agent et lecteur invités |
| E-P2-06a | ÉCART | « Cette adresse e-mail est déjà utilisée. » révèle l'existence du compte (le scénario attend un message neutre). Non revérifié après correctif |

### Phases 3 et 4 — Offres, ouverture du pays et du produit

| Cas | Résultat | Remarque |
|---|---|---|
| P3-01, P3-02, E-P3-01a, E-P3-01b, E-P3-01d, E-P3-01g | OK | Messages conformes (prix min > max, dates, formulations interdites) |
| E-P3-01h | ÉCART | « contrat validé » est bloqué dès la création d'offre (le scénario le prévoit non bloqué à cet endroit) |
| E-P3-01k | OK | Offre avec `<script>`, `<img onerror>`, SQL, `{{7*7}}`, `=HYPERLINK` rendue en texte côté courtier (admin et public : voir E-P4-03) |
| E-P3-01c | NJ | Prime négative : retour non exploitable |
| P4-01, E-P4-01a, E-P4-01b, E-P4-01e | OK | Publication, refus avec motif visible chez le courtier, suspension, notifications |
| P4-02, P4-03, E-P4-03a à E-P4-03c | OK | Offre suspendue, brouillon, UUID inexistant ou non UUID : même page « Offre indisponible » |

### Phase 5 — Visiteur

| Cas | Résultat | Remarque |
|---|---|---|
| P5-01, E-P5-01a | OK / PARTIEL | Une seule offre publiée : E-P5-01b non jouable |
| E-P5-02a, E-P5-02b | OK* | Messages corrects ; le message d'erreur du téléphone est moins précis que l'indice affiché |
| E-P5-02d (XSS) | OK | Récapitulatif et pages courtier et admin : texte brut, rien d'exécuté |
| E-P5-03a, E-P5-03c, E-P5-03d | OK / OK* | Consentement obligatoire ; double clic = une seule demande ; renvoi = « Votre demande a déjà été reçue… » |
| P5-03 | OK* | Écran : « reste à confirmer par un courtier partenaire », le courtier n'est pas nommé |
| P5-04, E-P5-04a | OK | Suivi, historique, conversation ; lien inconnu ou falsifié : écran neutre |

### Phase 6 — Lead

| Cas | Résultat | Remarque |
|---|---|---|
| P6-01, P6-02, P6-03, P6-04, P6-05 | OK | Lead visible et vu, acceptation, proposition (80 000–120 000 XOF), réponse « intéressé » côté visiteur |
| E-P6-03a, E-P6-03b, E-P6-03g | PARTIEL / OK | Champs vides : info-bulle native ; « contrat validé » refusé ; XSS en texte |
| P6-06, P6-07, P6-08, E-P6-06a, E-P6-06c | OK | Messagerie, pièce jointe, demande de document |
| E-P6-06b | OK* | « Ce message vient déjà d'être envoyé. Attendez la réponse du visiteur… » (texte différent) |
| E-P6-08a, E-P6-08c | OK | EICAR refusé côté visiteur, licence.pdf transmise ; aucun e-mail de messagerie ne reprend de contenu |
| P6-09 | OK | Suspension (dialogue conforme, bandeau « consultation seule », écriture refusée, offres retirées du public) puis réactivation |
| P6-10, E-P6-10b | OK | Retrait : lead clôturé, coordonnées masquées, actions bloquées, notification, preuves de consentement « withdrawn » |
| P6-11, E-P6-11a, E-P6-11b | OK | Demande DR-… ; doublon refusé ; prise en charge, aperçu d'effacement, clôture, e-mail sans note |
| E-P6-12a, E-P6-12b | PARTIEL | `compliance_admin` : 403 `forbidden_role` ; consultation auditée des échanges. Réaffectation nominale non jouée |

### Phase 7 — Clôture et facturation

| Cas | Résultat | Remarque |
|---|---|---|
| P7-01, E-P7-01a | OK / PARTIEL | Clôture « Gagné » avec e-mail sans issue commerciale ; sans issue : info-bulle native |
| P7-02, E-P7-02a à E-P7-02d | NJ | Aucun e-mail d'enquête de satisfaction (module non activable depuis l'interface) |
| P7-03, E-P7-03a | PARTIEL | Tarif Starter refusé : « Module billing désactivé ou configuration de facturation incomplète… » ; facture, paiement et PDF non jouables |

### Transversaux

| Cas | Résultat |
|---|---|
| T-01 | OK partiel : journal d'audit riche, acteurs masqués, e-mails jamais journalisés |
| T-02 | PARTIEL : UUID inexistant sur lead et offre → « introuvable » ; accès croisés entre deux courtiers non joués |
| T-03 | OK : jeton de V1 sur V2, sans jeton, référence inconnue, jeton SQL → même écran neutre |
| T-05 | OK partiel : chaînes SQL dans audit, filtres leads et jeton → aucun 500, aucune fuite |
| T-07 | OK partiel : 18 e-mails, aucun terme contractuel, liens vers les bonnes applications |
| T-08 | OK partiel : 23 routes FR et 3 routes EN balayées ; occurrences uniquement informatives ou négatives |
| A11Y-01, A11Y-02 | OK partiel : lien d'évitement, focus visible, 20 champs de la candidature étiquetés |
| I18N-01 | PARTIEL : `/en/…` répond avec `<html lang="en">` |
| T-04, T-06, T-09, A11Y-03, A11Y-04, RSP-01 à RSP-04, I18N-02 à I18N-04 | NJ (section 4) |

## 3. Écarts et points à arbitrer

### Comportement ou sécurité

1. **Étape de revue manuelle absente du scénario.** Produit et liaison pays-produit ont « Revue manuelle obligatoire » ouverte par défaut : toute demande passe « En revue manuelle » et attend une décision dans Admin > Opérations > Revue devis. Le scénario (P5-03 puis P6) l'ignore ; il faut l'ajouter ou fermer ce flag en prérequis.
2. **Jetons de suivi rotatifs.** Chaque e-mail de cycle de vie (transmis, clôturé, demande traitée) émet un nouveau jeton et invalide le précédent. Un visiteur qui conserve un ancien e-mail voit « Ce lien de suivi ne permet pas d'afficher une demande ». Cela contredit « lien réutilisable » (P5-04).
3. **Retrait de consentement : données encore visibles.** Chez le courtier, les « réponses consenties » (ville, marque, usage, préférence de contact) restent affichées ; seules les coordonnées sont masquées. Côté Admin, la fiche prospect montre nom, e-mail et téléphone en clair alors que le consentement est « Retiré ».
4. **Effacement.** Une demande d'effacement peut être clôturée « Traitée » sans que le lot d'effacement soit approuvé ni exécuté (case de confirmation à cocher). Conforme au libellé, mais le visiteur voit « Traitée » alors que rien n'est effacé.
5. **Existence de compte révélée** à l'invitation d'un collaborateur (E-P2-06a) et à la création d'un utilisateur Admin (E-P0-07a) : « Cette adresse e-mail est déjà utilisée. » Le cas équivalent sur la fiche partenaire est devenu neutre après correctif.
6. **Notification « Nouveau lead assigné »** : envoyée à l'adresse du contact de la candidature et non à celle du propriétaire du compte, et libellée « Un lead unknown (CI) ».
7. **Journal d'audit** : chaque consultation publique (liste d'offres, page produit) crée une entrée ; 493 entrées en une heure, ce qui noie les événements utiles du journal opposable.
8. **Compte suspendu** : les boutons d'écriture (Enregistrer le brouillon, Soumettre, Retirer) restent actifs sur la fiche offre ; le refus n'arrive qu'à l'action, avec un message correct.

### Libellés et formes

9. Validation native du navigateur (« Veuillez renseigner ce champ », « Veuillez cocher cette case… », « Sélectionnez un élément dans la liste ») à la place des messages serveur attendus : E-P6-03a, E-P7-01a, rejet de demande de données sans note, motif trop court de suspension.
10. Textes différents de l'attendu : doublon de visiteur, doublon de message, téléphone invalide, doublon d'e-mail Admin, motif trop court (« Saisie invalide : … Detail : Validation failed » : texte technique visible).
11. Statuts qui restent périmés jusqu'au rechargement : demande de document « Ouverte » chez le courtier alors que le visiteur l'a fournie ; statut « Demande transmise » affiché après retrait de consentement.
12. « Historique minimal » du lead vide malgré retrait et clôture ; « Vu le : Pas encore » sur un lead consulté après clôture.
13. Accueil public : « 0 pays ouvert » alors que la Côte d'Ivoire est publique.
14. Page Assignations (Admin) : la colonne d'action est tronquée à 1534 px (formulaire « Réaffecter » et message d'erreur coupés), statut « closed » coupé en deux lignes.
15. Champ « Pays (ISO) » du tarif : le placeholder « CI » est pris pour une valeur (« Saisie incomplète »).
16. « Retirer cette proposition » reste proposé sur un lead clôturé.
17. Filtre « Garantie incluse » sans résultat : le texte « Aucune garantie n'est publiée… » est déplacé.

### Prérequis manquants dans le scénario

18. La validation du téléphone d'un pays exige le préfixe et la longueur renseignés sur la fiche pays (sinon 7 chiffres sont acceptés) : à ajouter en P0.
19. Un régime réglementaire doit exister avant d'ouvrir le pays ; le compte `compliance_admin` ne peut pas le créer, le Super Admin oui. La liste des assureurs est vide en base vierge (« Autre assureur » seulement). La checklist pays compte 10 contrôles, le §2 n'en liste que certains.
20. Le formulaire d'ajout d'un utilisateur Admin accepte un nom d'un caractère (utilisateur `test.msg.nom1.c8qbr` créé, à ignorer).

## 4. Cas non joués et raisons

| Cas | Raison |
|---|---|
| P7-02, E-P7-02a à E-P7-02d | Enquête de satisfaction : aucune activation ni délai configurable depuis l'interface (script d'exploitation requis) |
| P7-03 (facture, paiement, PDF), E-P7-03b à E-P7-03e | `billing_enabled` fermé, sans bouton ; mentions légales et TVA du pays non configurables dans le parcours |
| E-P0-02b (rejeu par PATCH direct de l'API) | Jeton de session httpOnly : pas d'appel API direct authentifié depuis le navigateur |
| RSP-01 à RSP-04 | Le redimensionnement de fenêtre n'a pas changé le viewport (1534 px) ; l'iframe à 375 px est impossible, la page refusant d'être encadrée. À rejouer en émulation mobile |
| A11Y-03, A11Y-04, A11Y-02 (en erreur) | Navigation clavier complète, `role="log"`, Échap sur dialogues non vérifiés |
| T-02 (entre courtiers), P6-12 nominal, E-P6-12a (même courtier, courtier inéligible, motif 7 car.) | Courtier B non activé ; compte Super Admin plus utilisable après expiration de session (mot de passe non conservé après la reprise) |
| E-P6-09a (résiliation), E-P6-09b (licence suspendue, alerte < 30 jours) | Résiliation irréversible : à jouer sur pile jetable ; licence non jouée faute de temps |
| E-P5-01b, E-P5-01c à E-P5-01e, E-P5-02c, E-P5-02e à E-P5-02g, E-P5-03b, E-P5-03e à E-P5-03j, E-P5-04b à E-P5-04e | Une seule offre publiée ; parcours de dépôt de documents visiteur et variantes de jeton non rejoués |
| E-P6-01a à E-P6-01d, E-P6-02a à E-P6-02c, E-P6-03c à E-P6-03f, E-P6-05a à E-P6-05c, E-P6-07a, E-P6-07c, E-P6-07d, E-P6-08b | Cas limites de lead, de proposition et de messagerie non rejoués |
| E-P6-01c (export CSV), téléchargement de pièce côté courtier | Un téléchargement exige votre autorisation explicite ; non demandé |
| E-P6-10a (second retrait) | Le bouton disparaît après le premier retrait |
| E-P6-11b version support, E-P6-12b version support | Compte support non activé |
| P5 en anglais, I18N-02, I18N-03, T-04, T-06, T-09, E-P0-01c, E-P1-01j | Parcours EN, e-mails EN et limites de débit non joués ; les limites de débit sont à réserver à la fin sur pile jetable |
| Cas de durée ou d'horloge (jetons de 30 min, expiration à 12 mois) | Réservés à une pile jetable |

## 5. Recommandations

1. Décider du sort des points 3, 4 et 5 de la section 3 (consentement retiré, effacement « Traité », énumération de comptes) : ce sont les seuls qui touchent à la protection des données.
2. Ajouter au scénario les prérequis 1, 18 et 19, et préciser pour chaque cas si le message attendu vient du serveur ou de la validation native du navigateur.
3. Prévoir un moyen d'activer billing et enquête de satisfaction sur la pile de test (script d'exploitation documenté), sinon P7-02 et P7-03 resteront injouables.
4. Rejouer sur une pile jetable : résiliation du courtier, limites de débit, cas d'horloge, réaffectation avec un courtier B, responsive en émulation mobile.
