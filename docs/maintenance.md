# Storefront availability

Current state: `maintenance: false`. The owner explicitly requested reopening on 2026-10-09.

The switch in `config.mjs` is changed only at the owner's request. Set `maintenance: true` to temporarily block the public storefront, product pages, static files and lead submission with HTTP 503 and `Retry-After: 3600`. That header suggests when a client may retry; it does not schedule reopening. The temporary page has no analytics or order form and responses are not cached.

Health/readiness endpoints and the existing authenticated admin remain available during maintenance. Robots rules remain unchanged. Stored leads and retention rules are unaffected.

To reopen: set `maintenance: false`, commit to main, and confirm the Timeweb deployment and public availability. Review the current price/offer expiration date before reopening.

Maintenance does not stop paid hosting/database resources or pause advertising campaigns.
