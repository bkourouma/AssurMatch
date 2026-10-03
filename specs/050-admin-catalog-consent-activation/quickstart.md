# Quickstart: 050 — vérifier SC-01 (préparer CI et Sénégal)

## Validation automatisée

```bash
export DATABASE_URL=postgresql://x:x@localhost:5432/x NODE_ENV=test
npx prisma generate --schema backend/prisma/schema.prisma
npx prisma validate --schema backend/prisma/schema.prisma
npm run typecheck && npm run lint && npm run test && npm run test:web
```

## Parcours manuel (pile locale)

1. Lancer la pile locale sans seed démo (`cmd /c launch-local.bat`, ou le skill `run-all-apps`), appliquer les migrations, puis `npm run seed:reference`.
2. Se connecter à l'admin (http://localhost:3602) en Super Admin avec MFA.
3. **Catalogue → Pays → Sénégal** :
   - vérifier la devise XOF, les langues fr et en, l'indicatif +221 et 9 chiffres ;
   - passer le statut en « interne » avec un motif ;
   - activer `country_comparison_enabled`.
4. **Liaisons** : SN × Voyage existe en statut « interne », tous ses flags fermés. Tenter d'activer `product_quote_enabled` : refus « formulaire requis ».
5. **Consentements** (compte Compliance Admin) :
   - créer un texte `lead_transmission` FR pour SN depuis le modèle `lead-transmission-fr` ;
   - prévisualiser, puis publier ;
   - créer et publier la version EN ;
   - tenter de publier un texte contenant « souscrire maintenant » : refus.
6. **Formulaires de devis** : créer le formulaire FR de SN × Voyage (les champs génériques sont présents d'office) et le publier ; idem en EN.
7. Revenir à la liaison et activer `product_quote_enabled` : accepté.
8. **Ouverture publique** : tenter d'activer `country_public_enabled` pour SN. Le refus liste les blocages restants (partenaire actif licencié, offre publiable, statuts publics) avec leurs liens « Corriger ». C'est le comportement attendu tant que les specs 051 et 052 ne sont pas livrées.
9. **Contrôle public** (si un pays de démo est ouvert) : `/en/...` affiche le formulaire et le consentement en anglais. Un numéro sénégalais à 8 chiffres est refusé.
10. **Audit** : chaque action ci-dessus apparaît avec son motif dans les journaux d'audit.
11. **Seed relancé** : `npm run seed:reference` relancé ne referme aucun flag ouvert à l'étape 3.
