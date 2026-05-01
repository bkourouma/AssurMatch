# AssurMatch Preproduction Architecture

## Topology (Option B — three containers)

```
                                  Internet
                                     │
                                     ▼
          ┌──────────────────────────────────────────────────────┐
          │                    Nginx (HTTPS)                     │
          │      Let's Encrypt certificates per sub-domain        │
          └────┬───────────────┬────────────────────┬────────────┘
               │               │                    │
               ▼               ▼                    ▼
   assurmatch.alliance…  backoffice-…             api-…
       127.0.0.1:3601   127.0.0.1:3602        127.0.0.1:3600
            │                │                      │
            ▼                ▼                      ▼
   ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐
   │ assurmatch-    │  │ assurmatch-     │  │ assurmatch-app   │
   │ public         │  │ backoffice      │  │ (NestJS API)     │
   │ Next.js        │  │ Next.js         │  │ Port 3600        │
   │ Port 3601      │  │ Port 3602       │  │                  │
   └────────────────┘  └─────────────────┘  └──────────┬───────┘
                                                       │
                                              ┌────────┴───────┐
                                              ▼                ▼
                                          PostgreSQL         Redis
                                              │                │
                                              └─── BullMQ      │
                                                               │
                                          /home/deployer/apps/assurmatch/uploads
                                          /home/deployer/apps/assurmatch/data
                                          /home/deployer/apps/assurmatch/backups
```

## Surfaces

- `https://assurmatch.allianceconsultants.net` — public visitor (Next.js).
- `https://backoffice-assurmatch.allianceconsultants.net` — broker + admin (Next.js).
- `https://api-assurmatch.allianceconsultants.net` — backend API (NestJS).

## Constitutional separation

The three runtime containers materialize the constitutional separation between Web Publique
Client, Back-office Partenaires/Plateforme, and Backend API. None of them imports from another
at runtime; only the shared `packages/shared/` is reused at build time.

## Sensitive data

- Documents: stored locally in the `uploads` Docker volume.
- Backups: stored locally on the VPS, retention 14 days, encrypted with `gpg --symmetric` if
  `BACKUP_PASSPHRASE` is configured.
- Secrets: only in `/home/deployer/apps/assurmatch/.env.production` (mode 0600, owned by `deployer`).
