# Socle plateforme AssurMatch

## Prerequis

- Node.js 24.x
- PostgreSQL, Redis et stockage S3 compatible via `docker-compose.yml`
- Variables locales a partir de `.env.example`

## Commandes

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run test:web
```

## Garde-fous

- Les flags publics et commerciaux restent desactives par defaut.
- WhatsApp est le canal de base des notifications techniques et chaque envoi WhatsApp est aussi envoye par email.
- Le pre-check de routage ne transmet pas de lead et ne notifie pas de courtier.
- L'IA avancee reste desactivee; les modules IA disabled produisent zero appel modele.
- Les actions sensibles doivent produire un AuditLog sans PII brute.
