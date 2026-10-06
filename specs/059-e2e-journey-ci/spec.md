# Feature Specification: Tests de bout en bout des scénarios métier en CI

**Status**: Validated (workflow continu autorisé par l'utilisateur le 2026-10-03)
**Input**: PRD v0.3, EPIC M (M-01 à M-04) et scénarios SC-01 à SC-10. Dépend des specs 050 à 057.
**Impacted surfaces**: tests (Playwright multi-applications), CI, runtime Docker de test, scripts de seed. Aucun code produit modifié, sauf des corrections de défauts révélés par les tests.

## Why
Sur les 53 tests Playwright, 50 ne font que vérifier des marqueurs dans le code source. Les vrais tests navigateur sont désactivés en CI. Aucun scénario multi-applications n'est automatisé, et aucun garde-fou ne vérifie que chaque capacité est réellement atteignable.

## User stories
1. **(P1) Scénario complet sur une pile vierge.** En CI, une pile Docker vierge (seed de référence et premier Super Admin, sans seed démo) déroule le scénario cible dans les trois apps :
   - l'admin ouvre la Côte d'Ivoire et ses produits (SC-01), puis onboarde un courtier (SC-02) ;
   - le courtier active son compte (SC-03) et crée une offre, que la conformité valide (SC-04) ;
   - le visiteur demande un devis sur cette offre (SC-05) ;
   - le courtier accepte et envoie une proposition (SC-06), et le visiteur répond « intéressé » (SC-07).

   Les e-mails sont lus dans Mailpit. La MFA est franchie avec un secret TOTP de test.
2. **(P1) Cas interdits (SC-09).** Les cas suivants sont vérifiés de bout en bout : pays fermé, absence de consentement, courtier suspendu, isolation entre courtiers.
3. **(P1) Garde-fou d'atteignabilité.** Chaque contrôleur de domaine est soit câblé en HTTP, soit marqué « interne ». Une capacité ajoutée sans route fait échouer la CI.
4. **(P2) Test de charge.** Le catalogue public et la soumission de devis tiennent 50 req/s, avec un p95 inférieur à 800 ms, sur la pile Docker.

## Requirements
- **FR-001** `docker-compose.e2e.yml` (API, worker, trois apps, Postgres, Redis, Mailpit, ClamAV facultatif ou scanner EICAR) et script `npm run test:e2e:stack` qui monte la pile, applique les migrations et le seed de référence, crée le premier Super Admin, lance Playwright et démonte la pile.
- **FR-002** Projets Playwright séparés pour le public et le back-office (principe III), dans `tests/e2e/`. Utilitaires : lecture Mailpit, calcul TOTP, accès admin et courtier.
- **FR-003** Spécifications E2E : `scenario-core.spec.ts` (SC-01 à SC-07, en séquence), `forbidden-cases.spec.ts` (SC-09), `visitor-tracking.spec.ts` (lien magique, renvoi, avis).
- **FR-004** Job CI `e2e` sur pull request et sur `main`, avec traces et vidéos conservées en cas d'échec.
- **FR-005** Test d'inventaire d'atteignabilité : liste des classes de contrôleurs de domaine et de leurs méthodes publiques ; chacune doit être câblée, ou figurer dans `INTERNAL_ONLY` avec une justification.
- **FR-006** Script de charge (k6 ou autocannon) avec seuils ; non bloquant en CI, sauf exécution manuelle.
- **FR-007** Tout défaut révélé par ces tests est corrigé dans cette spec. Une correction hors périmètre est documentée.

## Success criteria
- Le scénario cible passe en CI sur une pile vierge.
- 0 contrôleur de domaine non câblé et non justifié.
