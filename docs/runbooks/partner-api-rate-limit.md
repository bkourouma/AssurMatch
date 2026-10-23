# Partner API rate limiting (spec 075 FR-C1..C3)

Every route under `/partner-api/v1/*` is rate limited before any business code runs.

## Limits

Fixed window, two buckets counted on each request:

| Bucket | Variable | Default |
| --- | --- | --- |
| Window length (seconds) | `ASSURMATCH_PARTNER_API_RATE_LIMIT_WINDOW_SECONDS` | 60 |
| Per API key | `ASSURMATCH_PARTNER_API_RATE_LIMIT_KEY_MAX` | 120 |
| Per client IP | `ASSURMATCH_PARTNER_API_RATE_LIMIT_IP_MAX` | 600 |

An empty, non numeric or out-of-range value falls back to the default. Restart the API to apply a change.

- The key bucket is built from a hash of the key as presented, valid or not: guessing keys is throttled and the
  response never says whether a key exists. Neither the key nor the IP is stored in clear (Redis keys are
  `partner-api:rl:<window>:key|ip:<sha256 prefix>`) or logged.
- The client IP follows the trusted proxy rules of the other public routes (`TRUSTED_PROXY_HOPS`).

## Reading a 429

Over the limit, the API answers `429` with `{ "code": "RATE_LIMITED", "message": "Too many requests. Please try again later." }`
and a `Retry-After` header (seconds until the window ends). Every response also carries
`X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (seconds) for the most restrictive bucket.
Partners should wait `Retry-After` seconds, then retry. The `rate_limited` metric is labelled `route="partner-api"`.

## Degraded mode

If Redis is unavailable the limiter does not fail the request (never a 500): it falls back to a per-process
in-memory counter (bounded to 10 000 entries, expired entries purged) and logs
`partner_api.rate_limit_degraded` at `warn` (at most once every 30 s, no key or IP in the log).
In this mode limits apply per API instance, not cluster-wide. Fix Redis (see `health.md`) and the warning stops.
