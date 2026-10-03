# Recherche : notifications courtier/admin restantes et rappels d'expiration (spec 061)

## R1 — Où planifier les rappels

**Décision** : une tâche `scheduled-alerts` dans la boucle du worker de la spec 057 (`scripts/worker/assurmatch-worker.ts`), exécutée au plus une fois par `ASSURMATCH_SCHEDULED_ALERTS_INTERVAL_MINUTES` (60 min par défaut) dans le processus, désactivable par `ASSURMATCH_SCHEDULED_ALERTS_ENABLED=false`.

**Pourquoi** : le worker est déjà l'unique processus long (une réplique), recharge les flags à chaque cycle et ne journalise que des compteurs. Un cron externe aurait ajouté un second point d'exécution.

**Remplacement de la spec 052 R9** : les notifications `offer_expiring` créées lors de la lecture d'une liste d'offres (admin et courtier) sont supprimées. La lecture n'écrit plus rien ; la tâche planifiée produit la notification J-15, avec le même gabarit in-app `offer_expiring` pour que les entrées des deux générations se lisent pareil.

## R2 — Idempotence « par jour et par cible »

**Décision** :
- **Courtier** : chaque alerte porte une `dedupeKey` persistée sur la ligne `Notification` (index unique existant, spec 054 R3). La clé encode la cible et l'occurrence : `broker_license_expiring:{licence}:{date d'expiration}:J{seuil}`, `broker_offer_expiring:{version}:{date}`, `broker_task_due:task:{tâche}:{échéance}`, `broker_task_due:reminder:{rappel}`, `broker_quota_threshold:{partenaire}:{AAAA-MM}:{80|100}`, `broker_document_received:{document}:{lead}`. Une violation d'unicité (deux workers simultanés) est traitée comme un doublon : rien d'autre n'est envoyé.
- **Admin** : table `AdminAlert` avec une `conditionKey` (type + cible) et une `dedupeKey` unique (`conditionKey:AAAA-MM-JJ` pour les conditions persistantes, `conditionKey` seule pour les événements ponctuels : seuil de licence, offre expirée). Tant qu'une alerte est ouverte, une nouvelle détection ne fait que mettre à jour `lastSeenAt` et `occurrences`. Après acquittement, une condition persistante est relevée au plus le lendemain.

**Alternative écartée** : verrou Redis par jour. Il ne survit pas à un redémarrage de Redis et ne prouve rien en base.

## R3 — Seuils de licence J-60 / J-30 / J-7

**Décision** : `licenseBucket(joursRestants)` renvoie le plus petit seuil franchi (`ASSURMATCH_ALERT_LICENSE_DAYS`, `60,30,7` par défaut). Une licence vue pour la première fois à J-25 reçoit J-30 (pas J-60 rétroactivement) ; une interruption du worker entre J-31 et J-29 ne fait pas perdre J-30. La date d'expiration fait partie de la clé : une licence prolongée réarme ses rappels. Seules les licences `valid` sont considérées.

## R4 — Préférences de canal (spec 038)

**Décision** : in-app toujours ; e-mail toujours (socle opérationnel de la spec 038, qui refuse déjà de désactiver e-mail et in-app) ; SMS et WhatsApp uniquement si le cabinet a opté pour ce canal, puis le dispatcher existant applique encore le flag du canal et la configuration du fournisseur (aucun canal livré désactivé n'est ouvert). Le numéro utilisé est `primaryWhatsApp` du partenaire ; le corps SMS se limite au titre de l'alerte.

**Écart assumé** : « par e-mail selon ses préférences » est interprété dans le cadre de la spec 038, où l'e-mail n'est pas désactivable. Ajouter un opt-out e-mail par type d'alerte serait une décision produit nouvelle.

## R5 — Contenu des e-mails (FR-002)

**Décision** : un gabarit générique `brokerAlert` (sujet + phrase par type + lien vers la page du portail : `/leads`, `/crm`, `/account`, `/licenses`, `/offers`). Aucun numéro de licence, titre de tâche, nom d'offre ou donnée de prospect ne sort par e-mail ; le détail reste dans l'in-app, cloisonné par tenant. La garde de formulations (`assertSafe`, mots interdits FR/EN) s'applique au rendu. L'e-mail conformité (`admin_alert_raised`) ne contient que le libellé du type d'alerte et le lien vers le centre d'alertes ; il n'est envoyé que si `ASSURMATCH_COMPLIANCE_ALERT_EMAIL` est renseignée.

## R6 — Lead réaffecté et document reçu

- **Lead réaffecté** : la réaffectation (spec 054 R6) notifiait déjà le nouveau cabinet avec le type `broker_lead_assigned`. Elle produit désormais `broker_lead_reassigned` (e-mail « Lead réaffecté » + in-app « Lead réaffecté à votre cabinet ») et les canaux optionnels. Aucune notification n'atteint l'ancien cabinet.
- **Document visiteur** : `broker_document_received` était mis en file sans in-app ni rendu e-mail, et la valeur manquait dans l'enum Prisma (la mise en file échouait en PostgreSQL). La migration ajoute la valeur et l'alerte passe par le notificateur courtier.

## R7 — Quota mensuel

**Décision** : `quotaMonthlyLeads` du partenaire actif et le compteur mensuel déjà utilisé par l'éligibilité (`monthlyCountForPartner`). Seuils 80 % (`ASSURMATCH_ALERT_QUOTA_WARNING_PERCENT`) puis 100 %, une fois par mois et par seuil. Les packs de leads de la spec 060 ne modifient pas le quota de routage : ils ne sont pas comptés.

## R8 — Alertes admin

| Type | Condition | Clé |
|---|---|---|
| `license_expiring` | licence `valid` à J-60/J-30/J-7 | une fois par licence, date et seuil |
| `offer_expired` | version publiée expirée depuis moins de 30 jours (`ASSURMATCH_ALERT_OFFER_EXPIRED_LOOKBACK_DAYS`) | une fois par version |
| `country_without_public_broker` | pays `public` sans partenaire `active` autorisé et licencié | quotidienne |
| `unrouted_leads_spike` | plus de N demandes (10) bloquées, sans courtier ou en revue manuelle sur 24 h | quotidienne |
| `dispute_rate_high` | taux de leads contestés > 20 % sur 30 jours, avec au moins 10 leads | quotidienne par partenaire |
| `worker_stale` | aucun battement du worker depuis `ASSURMATCH_WORKER_STALE_MINUTES` (10) | quotidienne |

**Worker inactif** : le worker ne peut pas signaler son propre arrêt. Il écrit un battement dans la table `WorkerHeartbeat` après chaque cycle (en plus du fichier de la spec 057) ; le centre d'alertes vérifie ce battement à chaque lecture. Si le worker n'a jamais battu (environnement sans worker), aucune alerte n'est levée.

**Accès** : lecture par les rôles admin du tableau de bord ; acquittement réservé à `super_admin` et `compliance_admin`, MFA obligatoire, motif de 8 caractères minimum, audité (`admin_alert.acknowledged`).

## R9 — Désinscription de l'enquête de satisfaction (FR-005)

**Décision** : jeton signé sans état `base64url(payload).HMAC-SHA256`, payload `{v, p: "satisfaction_survey", s: sha256(adresse normalisée), l: fr|en}`. Clé : `ASSURMATCH_UNSUBSCRIBE_SECRET` (32+ caractères) ou, à défaut, dérivée de `ASSURMATCH_AUTH_TOKEN_SECRET` par HMAC avec séparation de domaine ; clé de test fixe en `NODE_ENV=test` ; erreur sinon. Seule l'empreinte de l'adresse est stockée (`NotificationUnsubscribe`, unique par empreinte et finalité) et auditée.

- Lien dans l'e-mail : `/desinscription?token=` (FR), `/en/unsubscribe?token=` (EN).
- La page publique ne modifie rien à l'ouverture (les scanners de messagerie préchargent les liens) : le visiteur confirme par un bouton, qui appelle `POST /notifications/unsubscribe`.
- Tout jeton invalide, falsifié ou mal formé donne la même 404 neutre ; une seconde confirmation est idempotente.
- Le worker d'enquêtes saute (`skipped`, `visitor_unsubscribed`) toute enquête vers une adresse désinscrite. Les messages transactionnels (suivi de demande) ne sont pas concernés.
- Pages non indexées, sans referrer, interdites dans `robots.txt`.
