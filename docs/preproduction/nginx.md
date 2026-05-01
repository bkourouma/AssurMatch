# Nginx configuration (template)

Three `server { ... }` blocks, one per sub-domain. HTTPS terminated at Nginx.

## Public — `assurmatch.allianceconsultants.net`

```nginx
server {
    listen 80;
    server_name assurmatch.allianceconsultants.net;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name assurmatch.allianceconsultants.net;

    ssl_certificate     /etc/letsencrypt/live/assurmatch.allianceconsultants.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/assurmatch.allianceconsultants.net/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api-assurmatch.allianceconsultants.net; frame-ancestors 'self';" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    location / {
        proxy_pass http://127.0.0.1:3601;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Back-office — `backoffice-assurmatch.allianceconsultants.net`

Same structure, port `3602`, **`X-Frame-Options DENY`**, and CSP that allows the API origin in `connect-src`.

## API — `api-assurmatch.allianceconsultants.net`

Same structure, port `3600`, no Next-specific tweaks. CSP `default-src 'none'` for error responses.

## Renewals

Certbot is configured via systemd timer; `certbot renew --quiet --post-hook "systemctl reload nginx"`
runs twice daily.

## Validation after edits

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://assurmatch.allianceconsultants.net
curl -I https://backoffice-assurmatch.allianceconsultants.net
curl -I https://api-assurmatch.allianceconsultants.net/admin/system/health
```

`curl -I` must return `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Content-Security-Policy` headers.
