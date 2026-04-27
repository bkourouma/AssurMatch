# Runbook — Nginx configuration

## Files

- `/etc/nginx/conf.d/assurmatch-public.conf`
- `/etc/nginx/conf.d/assurmatch-backoffice.conf`
- `/etc/nginx/conf.d/assurmatch-api.conf`

Templates live in `docs/preproduction/nginx.md` (this repo).

## Edit and reload

```bash
sudo vi /etc/nginx/conf.d/assurmatch-public.conf  # for example
sudo nginx -t
sudo systemctl reload nginx
```

## Renew certificates

Certbot's systemd timer handles automatic renewal. Manual renewal:

```bash
sudo certbot renew --quiet --post-hook "systemctl reload nginx"
```

## Validation

```bash
curl -I https://assurmatch.allianceconsultants.net
curl -I https://backoffice-assurmatch.allianceconsultants.net
curl -I https://api-assurmatch.allianceconsultants.net/admin/system/health
```

Each response must include `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Content-Security-Policy`.
