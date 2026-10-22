# Tâches : corrections issues du parcours E2E (spec 066)

**Spec** : `spec.md`

- [x] T001 F1 `prospects.repository.ts` : réutilisation du profil seulement si courriel + téléphone + nom identiques (mémoire et Prisma).
- [x] T002 F1 `quote-duplicate-detection.service.ts` : signal `possible_duplicate` sur téléphone seul (non bloquant) ; `quote-submission.service.ts` passe l'empreinte du téléphone.
- [x] T003 F1 Tests : unitaire dépôt prospects, unitaire détection de doublon, intégration HTTP « même téléphone, courriels différents » (courriels, jetons, renvoi du lien, contact courtier) et « même téléphone, même courriel ».
- [x] T004 F1 Revue de sécurité en lecture seule.
- [x] T005 F3 Action « Modifier » des agences (`updateAgencyAction`, boîte de dialogue, test source).
- [x] T006 F4 Middleware courtier : redirection vers `/?notice=crm_requires_pro`, notice sur le tableau de bord, tests mis à jour.
- [x] T007 F5 Messages `Country.pilotNotice` et `Country.productsLead` (FR, EN).
- [x] T008 F6 `.gitattributes`.
- [x] T009 Validations : typecheck, lint, vitest, Playwright, scan de secrets.
