# Handoff : intégration des lots « écarts PRD » (specs 067 à 076)

Mise à jour : 2026-10-22. Base décrite : lots 1 à 5, 7, 9 et 10 intégrés (specs 067, 068, 069, 070, 071, 072, 074, 076). Les lots 6 (spec 073, pilotage admin) et 8 (spec 075, sécurité) arrivent plus tard : ils ne sont pas décrits ici et ce document sera complété à leur intégration.

Principe commun : tout ce qui touche à l'IA, aux canaux sortants (SMS, WhatsApp, CRM) et au routage multi-courtiers est fermé par défaut. Rien de ce qui suit n'est actif sans action explicite d'exploitation.

## 1. Variables d'environnement nouvelles

Les exemples vivent dans `.env.example`, `.env.production.api.example` et `.env.production.worker.example`. Aucun secret dans le dépôt.

### API

| Variable | Défaut | Rôle (spec) |
|---|---|---|
| `ASSURMATCH_ROUTING_REQUIRE_RECORDED_CONTRACT` | `false` | `true` active le contrôle 9 : un courtier sans contrat enregistré, ou au contrat expiré, n'est plus routé (071). À n'activer qu'après la requête de détection (section 4). |
| `ASSURMATCH_ROUTING_LEAD_QUALITY_MIN_SCORE` | `30` (0 à 100, 0 désactive) | Sous ce score qualité, la demande part en revue manuelle admin, jamais en exclusion automatique (071, H3). |
| `ASSURMATCH_SMS_PROVIDER` | vide | `http` ou `twilio`. Toute autre valeur garde le fournisseur local qui n'appelle aucun réseau (076). |
| `ASSURMATCH_SMS_API_KEY` | vide | Secret (Bearer, ou jeton Twilio). Existait déjà. |
| `ASSURMATCH_SMS_API_URL` | vide | URL https sans identifiants. |
| `ASSURMATCH_SMS_SENDER` | vide | Identifiant ou numéro expéditeur. |
| `ASSURMATCH_SMS_ACCOUNT_ID` | vide | Obligatoire pour `twilio` (SID du compte). |
| `ASSURMATCH_WHATSAPP_PROVIDER` | vide | `whatsapp_cloud`. |
| `ASSURMATCH_WHATSAPP_API_KEY` | vide | Jeton d'accès permanent. Existait déjà. |
| `ASSURMATCH_WHATSAPP_PHONE_NUMBER_ID` | vide | Identifiant du numéro émetteur. |
| `ASSURMATCH_WHATSAPP_API_BASE_URL` | `https://graph.facebook.com/v21.0` | https uniquement. |
| `ASSURMATCH_WHATSAPP_TEMPLATE_NAME` | `assurmatch_operational_alert` | Modèle approuvé : le pointeur opérationnel est son seul paramètre. |
| `ASSURMATCH_WHATSAPP_TEMPLATE_LANGUAGE` | `fr` | |
| `ASSURMATCH_CHANNEL_HTTP_TIMEOUT_MS` | `10000` (borné 1000 à 30000) | Délai des appels SMS/WhatsApp/CRM. |
| `ASSURMATCH_ALERT_LEAD_EXPIRY_WARNING_PERCENT` | `80` (1 à 99) | Part du délai SLA consommée avant l'alerte `broker_lead_expiring` (069). |
| `ASSURMATCH_ALERT_LEAD_EXPIRY_LOOKBACK_DAYS` | `3` (0 à 60) | Jours après l'échéance pendant lesquels l'alerte reste annonçable (069). |

Les adaptateurs SMS/WhatsApp ne sont construits que si leur environnement est complet. Un worker démarré sans ces variables laisse les messages en file (`retryable`, raison d'audit `provider_not_configured_deferred`) : rien n'est perdu ni envoyé.

### Worker

| Variable | Défaut | Rôle (spec) |
|---|---|---|
| `ASSURMATCH_DOCUMENT_REMINDERS_ENABLED` | actif sauf `false` | Relance unique « documents manquants » (067). |
| `ASSURMATCH_DOCUMENT_REMINDER_DAYS` | `3` (1 à 30) | Délai après l'ouverture de la demande de documents (067). |
| `ASSURMATCH_DOCUMENT_REMINDER_INTERVAL_MINUTES` | `60` (1 à 1440) | Cadence de la tâche (067). |
| `ASSURMATCH_CRM_CONNECTOR_DELIVERY_ENABLED` | `false` | Doit valoir `true` pour que le worker livre au CRM, EN PLUS du flag `crm_connector_enabled` (076). |
| `ASSURMATCH_CRM_CONNECTOR_DELIVERY_LIMIT` | `25` (1 à 100) | Lot par cycle (076). |
| `ASSURMATCH_CHANNEL_OUTBOX_LIMIT` | `25` (1 à 100) | Messages SMS/WhatsApp traités par cycle (076). |
| `ASSURMATCH_SMS_*`, `ASSURMATCH_WHATSAPP_*` | voir ci-dessus | Le worker envoie : il doit porter les mêmes variables fournisseur que l'API. |

Compteur de visites : aucune variable correspondante n'existe dans cette base (aucun des lots 1 à 5, 7, 9, 10 n'en introduit). Si elle vient avec le lot 6 ou 8, elle sera ajoutée ici à leur intégration.

## 2. Flags sensibles : activation uniquement par `ops:apply-flag-policy`

Aucune route HTTP ne peut ouvrir ces flags (la liste est dans `backend/src/modules/feature-flags/sensitive-feature-flag-policy.ts`). Commande, depuis la racine, avec référence de politique, approbateur et motif :

```
npm run ops:apply-flag-policy -- --flag <clé> --value true --reference <réf> --approved-by <nom> --reason <texte>
```

Pour les flags à portée pays ou produit, ajouter `--scope-type` et `--scope-id`. L'API relit la valeur sous `ASSURMATCH_FEATURE_FLAG_REFRESH_SECONDS` (30 s). Fermer reste possible par HTTP pour les flags IA par pays et produit (`/ai-assistance/flags`, MFA, motif, audit).

Nouveaux flags de ce chantier, tous livrés fermés :

- `ai_assisted_routing_enabled` (071) : mode de routage « IA assistée », la suggestion n'est jamais appliquée seule.
- `broker_weekly_ai_summary_enabled` (069) : résumé hebdomadaire du courtier, protégé comme les autres flags IA.
- `crm_connector_enabled` (076) : connecteur CRM sortant.
- `sms_enabled`, `whatsapp_enabled` (076 les rend réellement émetteurs, avec le fournisseur et l'opt-in du destinataire).
- `country_ai_enabled`, `product_ai_scoring_enabled`, `product_ai_form_assistant_enabled` (074) : activation par la commande avec portée ; les produits `highly_sensitive` sont refusés.

Flags déjà existants mais désormais exercés par ces lots : `multi_broker_routing_enabled` (067, plusieurs offres, avec consentement nommant chaque courtier), `ai_summary_enabled` (068, explications d'offre et comparaison visiteur ; 070, résumé d'offre), `partner_webhooks_enabled` (074, l'envoi de test est refusé tant qu'il est fermé), `billing_enabled` (071).
Flags à portée produit non sensibles au sens de la politique : `product_document_upload_enabled` (067, étape documents du devis).

## 3. Migrations 0033 à 0040

Toutes additives (colonnes nullables ou avec défaut, nouvelles tables, valeurs d'enum), écrites avec `IF NOT EXISTS`. Rien n'est supprimé ni réécrit, hors le remplissage de colonnes neuves de 0034.

| Migration | Spec | Contenu |
|---|---|---|
| `0033_visitor_quote_journey_gaps` | 067 | `visitor_documents_reminder`, colonnes de `QuoteRequest` (offres supplémentaires, courtier choisi, source marketing) |
| `0034_catalog_offers_gaps` | 070 | catégories, texte légal, documents requis, versions de produit, assureurs, lien offre-assureur, attestations d'activation ; reprise des noms d'assureur existants |
| `0035_routing_billing_gaps` | 071 | mode `ai_assisted`, `RoutingDecision.controlDetails`, `PartnerSubscription`, add-ons, demandes de changement de plan |
| `0036` | réservée | arrive avec un des lots 6 ou 8 : ABSENTE de cette base, ne pas la créer |
| `0037` | réservée | idem : ABSENTE de cette base |
| `0038_content_cms` | 072 | table `ContentEntry` |
| `0039_broker_lead_alerts` | 069 | `broker_lead_expiring`, `broker_weekly_summary` |
| `0040_channels_integrations` | 076 | `ChannelOutbox`, connecteur CRM et ses livraisons |

La spec 068 (IA visiteur) et la spec 074 (IA admin, intégrations) n'ont pas de migration. Une base déployée avec 0033 à 0035 puis 0038 à 0040 présente un trou volontaire de numérotation : `prisma migrate deploy` l'accepte, mais les lots 6 et 8 devront livrer exactement 0036 et 0037 pour que l'ordre reste cohérent (les migrations s'appliquent dans l'ordre alphabétique et celles-ci seront appliquées après 0040 sur une base déjà à jour, ce qui est sans conséquence car elles sont indépendantes ; à vérifier à leur intégration).

## 4. Étapes de mise en ligne

1. Sauvegarde de la base (`docs/runbooks/backup-restore.md`).
2. Générer le client : `npx prisma generate --schema backend/prisma/schema.prisma`.
3. Appliquer : `npx prisma migrate deploy --schema backend/prisma/schema.prisma`, puis `npx prisma migrate status --schema backend/prisma/schema.prisma` (aucune migration en attente, les six ci-dessus appliquées).
4. Reconstruire et redéployer API, worker, site public, back-office plateforme et back-office courtier (les quatre images évoluent : API/worker, public, back-office, courtier). Renseigner les variables de la section 1 ; laisser vides celles des canaux tant qu'aucun fournisseur n'est contracté.
5. Détection des courtiers sans contrat, AVANT d'activer le contrôle 9 :
   `psql "$DATABASE_URL" -f scripts/ops/sql/lot5-active-partners-without-contract-detection.sql`
   (lecture seule, aucune donnée de contact). Le premier résultat doit valoir 0. Sinon, enregistrer les contrats manquants (back-office plateforme, fiche partenaire) puis relancer. Seulement ensuite, positionner `ASSURMATCH_ROUTING_REQUIRE_RECORDED_CONTRACT=true` et redémarrer l'API. Sans cette précaution, ces courtiers cesseraient de recevoir des leads.
6. Détection F1 (spec 066, déjà documentée) : `psql "$DATABASE_URL" -f scripts/ops/sql/f1-shared-prospect-detection.sql`, à lire avant l'ouverture au public.
7. Seed de référence : il crée les 14 catégories de produits sans réécrire l'existant.
8. Ouvrir les flags un par un, avec la commande de la section 2, après la décision de conformité correspondante. Ordre prudent : aucun flag IA ni canal tant que le fournisseur et la base légale ne sont pas validés.
9. Vérifications : `npm run local:health`, `/healthz` et `/readyz`, `GET /metrics` (avec jeton), puis un passage du parcours devis (confirmation reçue) et, le cas échéant, un envoi de test webhook et de message depuis `/partner-integrations` et `/messaging`.
10. Lot 8, plus tard : le rattrapage (backfill) des données personnelles prévu avec la spec 075 n'est PAS dans cette base. Ne rien lancer à ce sujet avant l'intégration du lot 8 ; ses étapes seront ajoutées ici.

Retour arrière : les migrations sont additives, le code précédent ignore les nouvelles colonnes. Fermer un flag (`--value false`) suffit pour couper une capacité (`docs/runbooks/rapid-disable.md`).

## 5. Points d'attention connus (résumé des specs)

- **067 Parcours devis.** Le routage multi-courtiers ne s'applique que flag ouvert ET consentement nommant chaque courtier ; sinon la première offre seule est retenue. Aucune source UTM d'une page antérieure au devis (cookies). Pas de champ de préférence de contact. La relance documents est un e-mail pointeur unique, jamais vers une autre adresse que celle du prospect de la demande (non-régression F1).
- **068 IA visiteur.** Toute aide IA visiteur est fermée par défaut et ne s'affiche qu'avec les flags global, pays et produit ouverts. Le libellé d'aide par champ est tiré du formulaire publié, un `fieldKey` inconnu donne 404. Quota 20 par heure et par IP, partagé entre assistances. Texte jamais appliqué automatiquement.
- **069 Back-office courtier.** Rien n'apparaît pour le Starter. Le coût par lead est une estimation, pas une facture. Le filtre agence est un filtre d'affichage, non une restriction d'accès. Le résumé hebdomadaire est une notification sans écran et dépend d'un flag sensible fermé.
- **070 Catalogue et offres.** Les offres privées ne sont jamais publiques, ni comparées, ni comptées. L'ouverture publique d'un pays ou d'un produit est refusée tant qu'une attestation ou un contrôle manque : prévoir la saisie des attestations par la conformité avant toute ouverture. Le résumé IA d'offre reste vide IA fermée.
- **071 Routage et facturation.** Contrôle 9 désactivé par défaut (section 4). Décisions encore à confirmer : l'expiration du contrat est portée par `PartnerSubscription.contractExpiresAt` ; un changement de plan accepté n'agit que sur la facturation ; le suggesteur « IA assistée » n'est pas branché sur la passerelle IA ; la facturation de `possible_duplicate` ; en mode `priority`, la dégradation SLA passe avant les priorités contractuelles.
- **072 CMS.** Texte brut uniquement. Un retrait est visible côté public en 2 minutes environ ; pour un retrait urgent, purger le cache du proxy et revalider le site. Aucun import du contenu statique, qui reste le repli. Une surcharge légale ne s'approuve que par la conformité ou le super administrateur.
- **074 IA admin et intégrations.** L'activation des flags IA par pays et produit n'existe pas par HTTP (décision du propriétaire en attente sur une éventuelle dérogation). Les secrets (clé d'API, secret de signature) ne s'affichent qu'une fois. Le test webhook est refusé flag fermé et limité à un envoi par endpoint et par 30 s.
- **076 Canaux et CRM.** Livraison au moins une fois : les récepteurs doivent dédoublonner (clé d'idempotence côté CRM). Une panne du worker entre l'envoi et l'enregistrement du résultat peut produire un doublon rare de SMS. Les redirections 3xx du CRM ne sont jamais suivies (échec, sans nouvel essai). Risque résiduel de DNS rebinding : l'adresse résolue n'est pas épinglée pour l'appel réel (même niveau que les webhooks partenaires, accepté pour le pilote). Pas d'écran pour le connecteur ni les messages en échec définitif, pas d'alerte sur ces échecs, pas de synchronisation CRM entrante.
- **Général.** Les lots 6 (073) et 8 (075) ne sont pas intégrés : les lignes correspondantes de `docs/prd_coverage_map.md` portent la mention « en cours d'intégration ». Les durées de rétention par défaut restent à valider juridiquement par pays (spec 046).
