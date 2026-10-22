# Spec 075 - Durcissement securite (lot 8)

**Statut** : en cours (branche `orch/2026-10-21-ecarts-prd-lot-8`). **Constitution** : III (donnees et securite), V (IA), VII (audit).

**Surfaces impactees** : Backend API, database / Prisma / migration 0037, shared packages (aucun contrat public modifie), apps Web Publique / Back-office Plateforme / Broker Back-office (`global-error`, sitemap public uniquement). Les parcours visiteur et les back-offices restent separes applicativement.

## Objectifs

### A. Chiffrement applicatif des PII au repos
- FR-A1. E-mail et telephone du `Prospect` (`emailNormalized`, `phoneNormalized`) et reponses de devis (`QuoteRequest.payload`) sont chiffres cote application (AES-256-GCM, enveloppe versionnee `enc:v1:<keyId>:<iv>:<tag>:<ct>`), jamais en clair en base une fois ecrits.
- FR-A2. Index aveugle : `emailBlindIndex` / `phoneBlindIndex` = HMAC-SHA256 avec une cle distincte de la cle de chiffrement. Recherche, dedoublonnage de prospect et lookup d'effacement (droit a l'oubli) passent par l'index aveugle. L'ancienne empreinte `*Fingerprint` (SHA-256 non salee) reste lue pendant la transition (lookup `OR`), plus ecrite pour les nouvelles lignes chiffrees.
- FR-A3. Cles hors depot : `PII_ENCRYPTION_KEYS` (liste `keyId:base64(32 octets)`), `PII_ENCRYPTION_ACTIVE_KEY_ID`, `PII_BLIND_INDEX_KEY` (base64, >= 32 octets). Aucune valeur par defaut en production : demarrage refuse si les cles manquent (`NODE_ENV=production`). Hors production sans cle : ecriture en clair (compatibilite dev/tests).
- FR-A4. Rotation : nouvelle cle ajoutee a l'anneau, `ACTIVE_KEY_ID` bascule, le script de backfill re-chiffre les lignes dont `piiKeyId` differe de la cle active ; l'ancienne cle reste dans l'anneau jusqu'a ce que le nombre de lignes avec l'ancien `piiKeyId` vaille 0. Documente dans `docs/runbooks/pii-encryption.md` et `docs/runbooks/secret-rotation.md`.
- FR-A5. Transition : lecture d'une valeur non enveloppee = valeur historique en clair (accepte). Script de retro-remplissage idempotent (`scripts/ops/backfill-pii-encryption.ts`), dry-run par defaut, `--apply` explicite, par lots, reprise possible, `--decrypt` pour le retour arriere. **Jamais execute sur des donnees de production par l'implementation.**
- FR-A6. Isolation : tout le chiffrement vit derriere un adaptateur (`backend/src/modules/common/security/`) appele par les repositories ; le reste du code manipule toujours des `ProspectRecord`/payloads en clair (domaine inchange).
- FR-A7. Aucune valeur PII, cle ou enveloppe dans les logs ni dans l'audit (tests de non-fuite).

### B. Audit fiable
- FR-B1. Plus d'echec silencieux : un echec de persistance d'un `AuditLogWriter.write` est journalise (log structure masque, compteur observable, health/metriques) et re-essaye via un outbox borne ; `writeAsync` propage l'erreur.
- FR-B2. Les actions sensibles (authentification, MFA, droits/roles, flags, export, effacement/retention, acces PII admin) utilisent `writeAsync` (fail-closed) ou sont couvertes par l'outbox avec alerte.
- FR-B3. Inalterabilite : migration 0037 = trigger append-only (UPDATE/DELETE/TRUNCATE refuses sans la porte de maintenance `assurmatch.audit_maintenance`) + `integrityHash` HMAC par ligne (cle `AUDIT_INTEGRITY_KEY`, id `integrityKeyId`), verifiable par `scripts/ops/verify-audit-integrity.ts` (lecture seule).
- FR-B4. Le contexte d'audit reste masque (`maskPii`), aucune valeur PII ni secret.

### C. Rate limit de l'API partenaire (Redis)
- FR-C1. `partner-api/v1/*` est limite par cle API (identifiant de cle, pas la cle en clair) et par IP, via Redis (fenetre fixe), limites configurables (`ASSURMATCH_PARTNER_API_RATE_LIMIT_*`), reponse 429 `RATE_LIMITED` + `Retry-After`, headers `X-RateLimit-*`.
- FR-C2. Redis indisponible : comportement defini et teste (fail-open borne par un limiteur memoire de secours, avec log d'alerte), jamais d'erreur 500.
- FR-C3. Les refus sont comptes (metriques).

### D. Flag IA produit sur les assistants courtier
- FR-D1. `AiGateway.isEnabled` applique le flag produit aux assistants courtier non-scoring (`lead_summary`, `next_action`, `relaunch_message`, `loss_analysis`, `duplicate_hint`) : `product_ai_scoring_enabled` doit etre vrai quand le scope produit est connu. Ferme par defaut ; motif `product_ai_broker_assistant_disabled`.
- FR-D2. `AIAssistanceService.status` reflete la meme regle.

### E. Donnees sensibles dans les prompts
- FR-E1. Detection (sante, identifiants nationaux/passeport, cartes avec Luhn, IBAN, secrets/jetons/cles API/JWT, mots de passe, plaques d'immatriculation) et masquage avant envoi a un fournisseur IA ; categories comptees dans le rapport de minimisation, jamais les valeurs.
- FR-E2. Garde de defense en profondeur : le prompt final (system + user) est rescanne juste avant l'appel fournisseur ; s'il reste une donnee sensible detectee, l'appel est refuse (interaction `refused`, motif `sensitive_data_in_prompt`, aucun appel modele) et audite sans valeur.

### F. `global-error` traduit
- FR-F1. Chaque app (public, admin, broker) a `app/global-error.tsx` (FR/EN selon la langue du document / du navigateur), qui rend son propre `<html>`/`<body>`, avec action "reessayer", sans fuite de message technique.

### G. Sitemap
- FR-G1. Le sitemap public liste toutes les pages indexables des deux locales avec `alternates`, exclut le parcours devis/suivi/avis (coherent avec `robots.ts`) ; test automatise de coherence sitemap/robots. Admin et broker restent `noindex` (pas de sitemap).

## Hypotheses et decisions metier (a valider)
- H6 (brief) : cles gerees par variables d'environnement / secret manager, pas de KMS dans ce lot.
- H-D : le flag produit des assistants courtier est `product_ai_scoring_enabled` (seul flag produit IA cote courtier existant).
- H-A : seuls Prospect + `QuoteRequest.payload` sont chiffres ; `ContactMessage`, `WaitlistEntry`, `PartnerApplication` (e-mails) sont hors lot (a traiter dans une suite).
- H-B : l'outbox d'audit est en memoire (borne) ; un echec durable declenche une alerte + metrique, il n'existe pas de WAL disque.

## Hors perimetre
Execution du backfill sur la production, KMS externe, chiffrement des documents (fichiers), chiffrement des autres entites.
