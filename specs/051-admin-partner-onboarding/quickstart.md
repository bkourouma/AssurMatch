# Quickstart: 051 — vérifier SC-02 (onboarder un courtier)

## Validation automatisée
```bash
export DATABASE_URL=postgresql://x:x@localhost:5432/x NODE_ENV=test
npx prisma generate --schema backend/prisma/schema.prisma && npx prisma validate --schema backend/prisma/schema.prisma
npm run typecheck && npm run lint && npm run test && npm run test:web
```

## Parcours manuel (pile locale, après la spec 050)
1. Seed de référence, puis activation de `country_broker_onboarding_enabled` pour la CI (catalogue, spec 050).
2. Soumettre une candidature sur `/courtiers/candidature` (référence `PA-…`).
3. **Admin → Partenaires → Candidatures** :
   - passer la candidature « En vérification » ;
   - la convertir avec un compte Compliance Admin ;
   - contrôler dans Mailpit l'e-mail de décision.
4. **Fiche du courtier créé** (statut Prospect) :
   - compléter les contacts, les assureurs, le plan, le quota et le SLA ;
   - passer le courtier « En vérification ».
5. **Licence et document** :
   - téléverser un PDF d'agrément sur la licence brouillon, puis l'accepter ;
   - valider la licence (Compliance) ;
   - vérifier qu'un fichier EICAR est mis en quarantaine.
6. **Couverture** : autoriser CI, Auto et Voyage.
7. **Contrat** : téléverser le contrat signé et l'enregistrer (version, date, signataire).
8. **Propriétaire** : l'inviter depuis la fiche et contrôler l'e-mail d'activation.
9. **Activation** :
   - tenter « Actif public » avant l'étape 7 : refus avec les blocages ;
   - l'activer après l'étape 8 : la checklist du pays affiche « courtier actif licencié » au vert.
10. **Suspension** : le portail courtier s'affiche en lecture seule avec une bannière, et « Accepter » est refusé.
11. **Résiliation** : la connexion du propriétaire est refusée.
