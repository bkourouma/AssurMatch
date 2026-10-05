# Runbook — Premier Super Admin

Deux mécanismes distincts, à ne pas confondre.

| Environnement | Mécanisme | Mot de passe |
| --- | --- | --- |
| local, préproduction | `LOCAL_BOOTSTRAP_ADMIN_*` au démarrage de l'API | fourni en variable |
| **production** (et préproduction si souhaité) | CLI à usage unique `ops:bootstrap-super-admin` (spec 057) | **jamais** : invitation + activation |

## Production — CLI à usage unique (spec 057, PRD K-05)

### Pré-requis

- Migrations appliquées (`prisma migrate status` propre).
- Fichier `/home/deployer/apps/assurmatch/env/api.env` complet (`DATABASE_URL`, `ENCRYPTION_KEY`,
  `ASSURMATCH_AUTH_TOKEN_SECRET`, `APP_BASE_URL` = URL du back-office admin).
- Aucune variable `LOCAL_BOOTSTRAP_ADMIN_*` dans l'environnement (l'API refuse de démarrer sinon).
- La personne destinataire est joignable par un canal séparé (téléphone, messagerie chiffrée).

### Exécution

Sur l'hôte de production, depuis `/home/deployer/apps/assurmatch` :

```bash
docker compose -f docker-compose.production.yml run --rm --no-deps api \
  node --import tsx scripts/ops/bootstrap-super-admin.ts \
  --email prenom.nom@<domaine> --display-name "Prénom Nom"
```

Options : `--ttl-minutes <5..120>` (défaut 30) ; `--send-email` pour envoyer l'invitation par le
fournisseur configuré (le lien n'est alors affiché que si l'e-mail n'a **pas** été réellement envoyé,
par exemple en mode aperçu).

Hors conteneur (poste opérateur avec accès réseau à la base) : `npm run ops:bootstrap-super-admin -- --email ... --display-name "..."`.

### Ce que fait la commande

1. Refuse (code 2, audit `ops.super_admin_bootstrap.refused`, raison `super_admin_exists`) dès qu'un
   Super Admin non supprimé existe : la commande est donc inerte après le premier usage.
2. Refuse si l'e-mail est déjà utilisé ou si les entrées sont invalides.
3. Crée l'utilisateur `super_admin`, statut `invited`, `mfaStatus=required`, **sans mot de passe**.
4. Émet un jeton d'activation (stocké haché, expiration bornée) et affiche une seule fois
   `<APP_BASE_URL>/activate?token=...`.
5. Écrit l'audit durable `ops.super_admin_bootstrap.created` (e-mail, environnement, mode, durée) —
   jamais le jeton.

### Après

1. Transmettre le lien par un canal séparé ; effacer l'historique du terminal si nécessaire.
2. La personne définit son mot de passe sur `/activate`, puis l'enrôlement MFA est imposé.
3. Vérifier l'audit : `ops.super_admin_bootstrap.created`, `user.created`, `user.activated`,
   `user.mfa_enrolled`.
4. Le Super Admin crée ensuite les autres comptes depuis le back-office (`/users`).

### Lien expiré

Si le lien expire avant usage, aucun autre Super Admin ne peut réémettre l'invitation et la CLI refuse
(un Super Admin existe). Procédure : supprimer l'utilisateur invité directement en base (opération
tracée dans le journal d'exploitation, deux personnes), puis relancer la CLI.

```sql
-- Uniquement si status = 'invited' et aucun autre super_admin.
UPDATE "User" SET status = 'deleted' WHERE email = '<email>' AND status = 'invited';
```

## Local / préproduction — `LOCAL_BOOTSTRAP_ADMIN_*`

```bash
APP_ENV=preproduction
LOCAL_BOOTSTRAP_ADMIN_EMAIL=admin@assurmatch.local
LOCAL_BOOTSTRAP_ADMIN_PASSWORD=<12+ caractères>
```

Redémarrer l'API. Si aucun Super Admin n'existe, le démarrage en crée un (`mfaStatus=required`, hash
argon2id) et audite `local_bootstrap_admin.created`. Avec `APP_ENV=production`, la présence de l'une
de ces variables fait échouer le démarrage et audite `local_bootstrap_admin.refused_in_production`.

Ne jamais journaliser un mot de passe, un secret MFA, des codes de secours ou un jeton d'activation.
