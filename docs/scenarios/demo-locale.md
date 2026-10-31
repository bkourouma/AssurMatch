# Démo locale — parcours de présentation

Mis à jour le 2026-10-31. Démo faite depuis le poste local (la préproduction n'est pas disponible : voir « Limites connues »). Données synthétiques du seed démo uniquement.

Surfaces : Web Publique (3601), Back-office Admin (3602), Back-office Courtier (3603), API (3600), Mailpit (8025).

## 1. Avant la démo (15 minutes avant)

1. Démarrer Docker Desktop et attendre que `docker info` réponde.
2. Lancer la pile depuis la racine du dépôt, en PowerShell :

   ```powershell
   $env:ASSURMATCH_POSTGRES_PORT = "54433"
   cmd /c launch-local.bat
   ```

   Le port PostgreSQL par défaut (55433) tombe parfois dans une plage réservée par Windows après un redémarrage de WSL (`netsh int ipv4 show excludedportrange protocol=tcp`). 54433 est libre. Ne pas mettre `ASSURMATCH_LOCAL_DEMO_SEED=1` : la base contient déjà les données de démo, et le seed republierait un formulaire de devis remplacé.
3. Vérifier :

   ```powershell
   npm run local:health
   npm run test:web:local
   ```

   Les 9 contrôles de santé et les 9 tests navigateur doivent être verts.
4. Ouvrir quatre onglets : `http://localhost:3601`, `http://localhost:3603/login`, `http://localhost:3602/login`, `http://localhost:8025`.

## 2. Comptes (sélecteur « Mode local » de la page de connexion, sans mot de passe)

| Rôle | Compte | Ce qu'il montre |
|---|---|---|
| Courtier Pro | `pro.owner@broker.example` | CRM complet : pipeline, Kanban, tâches, performance par conseiller |
| Courtier Enterprise | `enterprise.owner@broker.example` | Agences, SLA, analyse des pertes |
| Courtier Starter | `starter.owner@broker.example` | Portail simple, CRM verrouillé (« Disponible avec le plan Pro ») |
| Super admin | `super.admin@assurmatch.local` | Pilotage, opérations, conformité, catalogue |
| Conformité | `compliance.admin@assurmatch.local` | Validation des offres, textes de consentement, formulaires |

## 3. Parcours (environ 15 minutes)

### Visiteur (site public)

1. **Accueil** : « Comparez d'abord. Soyez accompagné ensuite. » Sélecteur pays et produit.
2. **Pays → Côte d'Ivoire → Assurance auto → Comparer les offres** : trois offres indicatives avec score, assureur porteur du risque, courtier partenaire responsable, franchise. Montrer les filtres et la comparaison côte à côte (cocher 2 offres).
3. Sur **« Auto Pro Local »** (courtier Pro Demo), cliquer **« Demander un devis »**. Choisir cette offre fait arriver le lead chez `pro.owner`, le compte au CRM le plus riche.
4. Formulaire en 4 étapes : besoin (usage, marque, ville, préférence de contact), coordonnées, vérification et consentement explicite, confirmation avec la référence `QR-…`.
   - Message clé : rien n'est transmis sans consentement nommant le courtier ; AssurMatch ne vend pas d'assurance.
   - Limite anti-abus : 5 demandes par minute pour une même IP, un même pays et un même produit.
5. **Mailpit** : deux e-mails au visiteur (« bien reçue », « a été transmise ») avec le lien personnel « Suivre votre demande », et un e-mail au courtier « Nouveau lead assigné ». Ouvrir le lien de suivi : espace visiteur sans compte (lien magique valable 30 jours).

### Courtier (back-office courtier, `pro.owner`)

6. **Leads** : la nouvelle demande apparaît en tête. Ouvrir le détail : réponses consenties, coordonnées, actions (accepter, demander des documents, répondre au visiteur).
7. **CRM → Pipeline** : indicateurs (taux de contact, délai de premier contact, coût par lead estimé), pipeline par statut, performance par conseiller. **Vue Kanban** pour déplacer un lead.
8. (Option) Se reconnecter en `starter.owner` et ouvrir **CRM** : verrouillé, ce qui montre la différence entre les plans.

### Plateforme (back-office admin, `super.admin`)

9. **Dashboard** : files à traiter (alertes conformité, licences expirées), demandes, leads routés, SLA courtier, répartition par pays et par produit.
10. **Opérations → Demandes de devis** : ouvrir la demande créée à l'étape 4. Consentement accordé (date, canal), décision de routage avec les courtiers exclus et leurs raisons (licence expirée, courtier suspendu…), affectation. Chaque consultation est auditée.
11. **Partenaires** : statuts (Actif public, Suspendu…), licences et capacités. Seul un courtier « Actif public » avec une licence valide reçoit des leads.
12. **Feature flags** : modules réglementés (paiement, signature, émission de police, sinistres, IA) fermés par défaut. Les flags sensibles ne s'ouvrent que par une commande d'exploitation auditée, jamais par un bouton.

## 4. Messages clés

- AssurMatch est une plateforme technique de comparaison indicative et de mise en relation. Le courtier partenaire confirme le devis et les conditions.
- Le consentement est explicite, nominatif et historisé, et chaque décision de routage est opposable.
- L'IA, le SMS, WhatsApp et le connecteur CRM sont livrés fermés. Leur ouverture est une décision de conformité tracée.
- Il y a trois plans courtier (Starter, Pro, Enterprise) avec des écrans adaptés.

## 5. Plan B

- Captures du parcours complet : `.local/demo/shots/` (générées par `npx playwright test -c .local/demo/playwright.demo.config.ts demo-walkthrough`, environ 2 minutes, la pile doit tourner).
- Si une page ne répond plus : `cmd /c stop-local.bat`, puis reprendre l'étape 1.2.

## 6. Limites connues (ne pas les montrer)

- **Préproduction indisponible** : les sous-domaines ne servent pas l'application, le déploiement CI est désactivé, aucun runner n'est enregistré et le back-office courtier n'est pas déployé en préproduction. À traiter après la démo.
- Le texte de consentement lié au formulaire auto CI est une ancienne version (« vos coordonnees », sans accent). Le rattacher au texte à jour relève de la conformité.
- Quelques messages produits par le backend restent sans accent sur des écrans secondaires (checklist d'activation, anomalies de routage, nom du régime « Cote d Ivoire » issu des données).
- En mode développement, la console du navigateur peut afficher un avertissement d'hydratation React sur la page des offres. Il est invisible à l'écran.
