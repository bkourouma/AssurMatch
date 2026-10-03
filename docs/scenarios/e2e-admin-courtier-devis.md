# Scénario E2E — Admin → Courtier → Visiteur → Réponse du courtier

Surfaces : Back-office Admin (3602), Broker Back-office (3603), Web Publique (3601), Backend API (3600), Mailpit (8025).
Prérequis : `launch-local.bat` avec `ASSURMATCH_LOCAL_DEMO_SEED=1` (le seed de base laisse comparateur et devis vides).

| # | Acteur | Action attendue | État actuel |
|---|--------|-----------------|-------------|
| 1 | Admin | Se connecte (MFA), crée le **tenant courtier** (raison sociale, licence, pays/produits autorisés) | ❌ Pas d'UI ni de route HTTP. Voie actuelle : script `import-partners` ou seed. |
| 2 | Admin | Crée l'**utilisateur courtier** lié au tenant (`POST /admin/users`, rôle courtier, `partnerTenantId`) → e-mail d'activation (Mailpit) | ✅ `apps/admin/app/users` |
| 3 | Courtier | Active son compte, se connecte (+ MFA) sur le broker back-office | ✅ |
| 4 | Courtier | **Ajoute ses produits/offres** | ❌ Aucune route ni page côté courtier. Les offres sont créées par l'admin (`POST /admin/offers`, `partnerTenantId` optionnel, puis `validate`), et l'UI admin `/offers` n'a pas de formulaire. |
| 5 | Visiteur | Parcourt pays → produit → offres → formulaire de devis, consentement, soumission | ✅ (offres visibles seulement si validées/publiées) |
| 6 | Système | Routage → lead affecté au courtier (admin peut forcer : `/routing`, assign) | ✅ |
| 7 | Courtier | Voit le lead (`/leads`, `/crm/leads`), l'**accepte** | ✅ |
| 8 | Courtier | « Répond » : statut CRM, notes, **proposition** (`POST /broker/crm/leads/:id/proposals`) | ⚠️ Enregistrée en CRM interne uniquement |
| 9 | Visiteur | Reçoit la réponse du courtier (e-mail / page de suivi) | ❌ La page de suivi n'affiche que « courtier partenaire » + statut ; aucune proposition n'est transmise au visiteur. |

## Verdict
Scénario **non réalisable de bout en bout aujourd'hui** : étapes 1, 4 et 9 manquantes. Contournements pour tester le reste : seed démo (courtiers déjà créés), offres créées via API admin, et vérification de la réponse côté CRM courtier uniquement.

## Écarts à traiter (specs à ouvrir)
1. Admin : création/onboarding de tenant courtier (HTTP + UI ; `AdminPartnersController` existe mais n'est pas câblé).
2. Courtier : gestion de ses offres (soumission → validation admin, conforme à la contrainte de publication).
3. Visiteur : transmission contrôlée de la réponse du courtier (consentement, conformité, anti-fuite de données).
