# Domains

## Final domain layout (sub-domains under `allianceconsultants.net`)

| Surface       | Domain                                                          | Container        | Internal port |
|---------------|-----------------------------------------------------------------|------------------|----------------|
| Public        | `https://assurmatch.allianceconsultants.net`                    | `assurmatch-public`     | 3601 |
| Back-office   | `https://backoffice-assurmatch.allianceconsultants.net`         | `assurmatch-backoffice` | 3602 |
| API           | `https://api-assurmatch.allianceconsultants.net`                | `assurmatch-app`        | 3600 |

## DNS records

Three A/AAAA records pointing to the VPS public IP:

```
assurmatch.allianceconsultants.net.            A     <vps-ipv4>
backoffice-assurmatch.allianceconsultants.net. A     <vps-ipv4>
api-assurmatch.allianceconsultants.net.        A     <vps-ipv4>
```

## TLS

Three Let's Encrypt certificates issued via certbot's `--nginx` plugin (recommended at first deploy).
A wildcard certificate `*.allianceconsultants.net` is a valid future evolution if the DNS provider
supports DNS-01 challenges.

## Why sub-domains (not path-based)

- Distinct CORS per surface (single explicit origin per consumer).
- Distinct CSP per surface, no shared origin.
- No path rewrites for upstream Next.js apps.
- No collision with internal Next `/api` routes.
- Independent certificate lifecycles.
