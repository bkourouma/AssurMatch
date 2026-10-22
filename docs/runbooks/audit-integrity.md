# Runbook : audit fiable et integrite du journal (spec 075, lot 8)

Surfaces : Backend API, base de donnees (migration 0037), scripts d'exploitation. Aucune surface publique.

## 1. Modele append-only

La table `"AuditLog"` est protegee par la migration `0037_security_hardening` :

- les triggers `AuditLog_append_only_row` (UPDATE, DELETE) et `AuditLog_append_only_truncate` (TRUNCATE) refusent toute modification (`integrity_constraint_violation`) ;
- la seule exception est la porte de maintenance, ouverte dans UNE transaction : `SET LOCAL assurmatch.audit_maintenance = 'on';`
- cette porte est reservee a la purge de retention manuelle des lignes expirees (`retentionUntil` depassee), executee par un operateur habilite, hors API. Elle n'est JAMAIS ouverte par le code de l'API ni par le worker ; ne pas l'ajouter a un script automatique ;
- toute ouverture de la porte doit etre tracee dans le registre d'exploitation (qui, quand, nombre de lignes, reference de la decision de retention).

Exemple (purge de retention, a executer par un operateur, jamais depuis l'application) :

```sql
BEGIN;
SET LOCAL assurmatch.audit_maintenance = 'on';
DELETE FROM "AuditLog" WHERE "retentionUntil" < now() - interval '30 days';
COMMIT;
```

## 2. Signature de chaque ligne

Chaque ligne ecrite par l'API porte `integrityHash` (HMAC-SHA256 hexadecimal de l'entree canonique : JSON a cles triees avec id, actorId, action, targetType, targetId, scope, result, reason, context, correlationId, occurredAt et retentionUntil en ISO) et `integrityKeyId` (la cle qui a signe).

Variables (API et worker) :

| Variable | Role |
| --- | --- |
| `AUDIT_INTEGRITY_KEYS` | liste `keyId:base64` separee par des virgules ; chaque secret fait au moins 16 octets (32 recommandes : `openssl rand -base64 32`) |
| `AUDIT_INTEGRITY_ACTIVE_KEY_ID` | identifiant de la cle qui signe les nouvelles lignes (facultatif s'il n'y a qu'une cle) |
| `ASSURMATCH_AUDIT_OUTBOX_MAX` | taille de l'outbox memoire de reessai (2000 par defaut) |

Il n'y a aucune cle par defaut. Sans cle, les lignes sont stockees sans signature (colonnes NULL). En production, l'API journalise `audit.integrity_key_missing` (niveau warn) au demarrage ; ce lot n'echoue pas dur, mais une production sans cle ne doit pas etre consideree comme conforme.

## 3. Verification

```
npm run ops:verify-audit -- --from 2026-10-01T00:00:00Z --to 2026-10-31T23:59:59Z --limit 100000
```

Lecture seule (SELECT par lots). Necessite `DATABASE_URL` et `AUDIT_INTEGRITY_KEYS` (toutes les cles, anciennes comprises). Le rapport donne le nombre de lignes verifiees, valides, sans signature et invalides, avec les identifiants seulement (jamais d'action ni de contexte).

- code de sortie 0 : aucune signature invalide ;
- code 2 : au moins une signature invalide (ligne alteree, ou cle inconnue) : traiter comme un incident de securite, conserver une copie de la base, comparer avec la sauvegarde la plus proche, informer le responsable securite ;
- les lignes sans signature sont attendues avant la configuration de la premiere cle ; leur nombre ne doit pas croitre apres cette date.

Planifier une verification periodique (hebdomadaire) sur la fenetre recente.

## 4. Rotation des cles

1. Generer une nouvelle cle et l'ajouter A LA LISTE `AUDIT_INTEGRITY_KEYS` (`ancien:...,nouveau:...`) sans retirer l'ancienne.
2. Passer `AUDIT_INTEGRITY_ACTIVE_KEY_ID` sur le nouvel identifiant, redemarrer API et worker.
3. Les lignes anciennes restent verifiables grace a leur `integrityKeyId`. Ne retirer une ancienne cle qu'une fois toutes les lignes qu'elle a signees purgees par la retention (10 ans par defaut) : la retirer avant rend ces lignes "invalides".
4. Stocker les secrets dans le gestionnaire de secrets, jamais dans le depot.

## 5. Echecs de persistance de l'audit

Un echec d'ecriture d'un `AuditLogWriter.write` n'est plus silencieux :

- log structure `audit.persist_failed` (action, type de cible, nom de l'erreur ; aucun contexte, aucun identifiant) ;
- compteurs exposes dans `/metrics` et dans `GET /admin/system/health` (`audit`) : `assurmatch_audit_persist_failures_total`, `assurmatch_audit_outbox_depth`, `assurmatch_audit_dropped_total` ;
- reessai depuis un outbox memoire borne (backoff de 1 s a 60 s, 20 tentatives par entree) ; au debordement l'entree la plus ancienne est abandonnee : `audit.dropped` (error) et `auditDropped` augmente. Chaque abandon est une ligne d'audit PERDUE.

Les actions sensibles (authentification, MFA, mot de passe, roles, drapeaux, effacement/retention, acces admin aux donnees, export) utilisent `writeAsync` : si l'ecriture echoue, l'operation echoue (fail-closed) plutot que de s'executer sans trace.

Que faire :

- `assurmatch_audit_outbox_depth > 0` durablement, ou `audit.persist_failed` en rafale : verifier la base (`/readyz`, connexions, espace disque, verrou du trigger) ; l'outbox se vide seule des que la base repond, sans intervention ;
- `assurmatch_audit_dropped_total` augmente : des lignes sont perdues. Rechercher la cause (base indisponible longtemps), reconstituer ce qui est possible depuis les logs applicatifs et les sauvegardes, ouvrir un incident, augmenter `ASSURMATCH_AUDIT_OUTBOX_MAX` si la panne etait courte mais intense ;
- l'outbox est en memoire : un arret brutal (SIGKILL) la perd. L'arret normal tente un dernier envoi (`drain`).

## 6. Limites du modele et durcissement des roles

- `assurmatch.audit_maintenance` est un reglage de session (`SET LOCAL`) que n'importe quelle connexion SQL peut positionner, y compris celle du role applicatif. Le trigger protege donc des erreurs et des UPDATE/DELETE accidentels (bug applicatif, requete manuelle), PAS d'une compromission SQL du role applicatif.
- Recommandation : utiliser pour l'API et le worker un role d'execution distinct du role de migration, avec `REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog"` (il ne garde que SELECT et INSERT). La purge de retention est alors executee avec un role d'exploitation separe.
- Le HMAC (`integrityHash`) detecte la modification d'une ligne, mais pas sa suppression : il n'y a pas de chainage entre les lignes. Une ligne supprimee ne se detecte que par comparaison avec une sauvegarde ou les logs applicatifs.
