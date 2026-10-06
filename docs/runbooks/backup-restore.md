# Runbook — Sauvegarde chiffrée hors site et restauration

Spec 058 FR-005. Objectifs : **RPO 24 h** (une sauvegarde par nuit), **RTO 4 h** (restauration complète
et vérifiée en moins de 4 heures). Surfaces : runtime / opérations. Aucune donnée applicative modifiée.

## Principe

| Élément | Choix |
| --- | --- |
| Base | `pg_dump --format=custom` (compressé), restauration par `pg_restore` |
| Fichiers | `tar.gz` de `UPLOADS_DIR` si stockage local des documents ; en stockage S3, le bucket documents a son propre versionnage |
| Chiffrement | **age** (clé publique sur le serveur, identité privée hors ligne) ; `gpg --symmetric AES256` en repli. Aucun envoi en clair : le script refuse de tourner sans chiffrement |
| Stockage | compatible S3 chez un **autre fournisseur ou une autre région** que la production ; `curl --aws-sigv4`, identifiants passés par stdin |
| Intégrité | `manifest.txt` (SHA-256 et taille de chaque fichier) envoyé en dernier : sa présence marque une sauvegarde complète |
| Rétention | répertoires `<préfixe>/<AAAAMMJJTHHMMSSZ>/` plus vieux que `BACKUP_RETENTION_DAYS` (30 j) supprimés à chaque passage. Recommandé en plus : verrouillage d'objets (Object Lock) ou règle de cycle de vie côté fournisseur |
| Supervision | push Uptime Kuma `BACKUP_PUSH_URL` (alerte si rien depuis 26 h) |

Scripts : `scripts/ops/backup-offsite.sh`, `scripts/ops/restore-offsite.sh`, `scripts/ops/backup-lib.sh`.
Configuration : `deploy/backup/backup.env.example` → `/etc/assurmatch/backup.env` (root, 0600).
Les anciens scripts locaux `scripts/preprod/backup-*.sh` restent pour la préproduction.

## Mise en place (une fois)

1. Paire de clés age, **hors du serveur** (poste d'un gardien) :
   ```bash
   age-keygen -o assurmatch-backup-identity.txt     # identité PRIVÉE : coffre + copie papier, deux gardiens
   age-keygen -y assurmatch-backup-identity.txt > backup-recipients.txt
   ```
   Copier seulement `backup-recipients.txt` sur le serveur (`/etc/assurmatch/backup-recipients.txt`).
   Perdre l'identité rend les sauvegardes irrécupérables : désigner deux gardiens et le consigner.
2. Bucket dédié, clé d'accès limitée à ce bucket (put/get/list/delete), versionnage ou Object Lock activé.
3. Outils sur l'hôte : `pg_dump`/`pg_restore`/`psql` de la **même version majeure** que le serveur
   (16), `curl` ≥ 7.75, `age`, `sha256sum`, `tar`.
4. Crontab root :
   ```cron
   15 2 * * * set -a; . /etc/assurmatch/backup.env; set +a; /opt/assurmatch/scripts/ops/backup-offsite.sh >> /var/log/assurmatch-backup.log 2>&1
   ```
5. Premier passage à la main, puis **un exercice de restauration** (ci-dessous) avant la mise en production.

## Sauvegarde manuelle

```bash
sudo sh -c 'set -a; . /etc/assurmatch/backup.env; set +a; /opt/assurmatch/scripts/ops/backup-offsite.sh'
```

Sortie attendue : une ligne par étape (`step=pg_dump`, `uploads_archive`, `encrypt`, `upload`,
`retention`) avec sa durée, puis `done stamp=... total_seconds=...`. Code de sortie ≠ 0 = échec.

## Restauration (exercice ou incident)

Toujours dans une base **vide** ; le script refuse une base qui contient des tables et la base de
`DATABASE_URL`. Pour un vrai sinistre : nouvelle base vide, restauration, puis bascule de
`DATABASE_URL` (et migrations : `docs/runbooks/migrations.md`).

```bash
set -a; . /etc/assurmatch/backup.env; set +a
export BACKUP_AGE_IDENTITY_FILE=/chemin/sécurisé/assurmatch-backup-identity.txt   # apporté par un gardien
scripts/ops/restore-offsite.sh --list                                            # sauvegardes complètes
createdb -h <hôte> -U <admin> assurmatch_restore_test
RESTORE_DATABASE_URL=postgresql://<admin>@<hôte>/assurmatch_restore_test \
  scripts/ops/restore-offsite.sh [--stamp 20261003T021500Z] [--uploads-dir /srv/restore/uploads]
```

Étapes : téléchargement → vérification SHA-256 (arrêt si un fichier est altéré) → déchiffrement →
`pg_restore --exit-on-error` → extraction des fichiers → comptages (`_prisma_migrations`, `User`,
`AuditLog`, `FeatureFlag`, `PartnerLicense`). Effacer l'identité de la machine après usage et
supprimer la base d'exercice (`dropdb ...`).

## Exercice chronométré du 2026-10-03

Exécuté dans l'environnement de développement de la spec 058 : PostgreSQL 16 (conteneur), schéma
complet (27 migrations), 200 000 lignes `AuditLog` (base 131 Mo), 5 documents (1 Mo), stockage S3
simulé par `scripts/ops/testing/fake-s3.py` (signature SigV4 présente, non vérifiée).

| Étape | Durée |
| --- | --- |
| Sauvegarde : `pg_dump` (7,5 Mo compressés) | 1 s |
| Sauvegarde : archive des fichiers | < 1 s |
| Sauvegarde : chiffrement age | < 1 s |
| Sauvegarde : envoi + manifeste | 1 s |
| Sauvegarde : rétention (1 répertoire de 2020 supprimé) | < 1 s |
| **Sauvegarde totale** | **2 s** |
| Restauration : téléchargement + vérification SHA-256 | < 1 s |
| Restauration : déchiffrement | 1 s |
| Restauration : `pg_restore` | 3 s |
| Restauration : fichiers + comptages | 1 s |
| **Restauration totale** | **5 s** |

Résultats : comptages identiques (`AuditLog` 200 000/200 000, `_prisma_migrations` 27/27), fichiers
identiques (`diff -r`), aucun texte en clair dans le stockage, refus vérifiés (base non vide, base de
production, sauvegarde altérée → `checksum mismatch`, absence de chiffrement). Variante `gpg` : 4 s.

Extrapolation pour le RTO : le temps est dominé par le transfert et `pg_restore` (~linéaire). Pour une
base de 10 Go, compter ~15 min de téléchargement à 100 Mbit/s et 20–40 min de `pg_restore` : RTO de
4 h tenu avec marge. **À refaire sur le fournisseur S3 réel** avant le lancement, puis chaque trimestre
(consigner date, sauvegarde utilisée, durées, comptages, anomalies dans le journal d'exploitation).

## Notes

- Le module S3 des documents (spec 053) n'est pas couvert par ce script : activer le versionnage et la
  réplication du bucket documents chez le fournisseur.
- La rétention parcourt les 1 000 premiers objets du préfixe (≈ 300 jours à 3 objets/jour) ; au-delà,
  le script avertit (`listing truncated`).
- Rotation des clés : nouvelle paire age, mise à jour de `backup-recipients.txt` ; conserver l'ancienne
  identité tant que des sauvegardes chiffrées avec elle sont dans la rétention.
