# Temporary closure

The owner requested that the website remain closed until explicitly instructed otherwise.

`config.mjs`: `maintenance: true` blocks the public storefront, product pages, static files and lead submission with HTTP 503 and `Retry-After: 3600`. That header suggests when a client may retry; it does not schedule reopening. The temporary page has no analytics or order form and responses are not cached.

Health/readiness endpoints remain available for hosting checks. Robots rules remain unchanged. The existing authenticated admin stays available to the owner; credentials and database configuration are unchanged. This change does not delete stored leads or alter existing retention rules.

To reopen, only after an explicit owner request: set `maintenance: false`, commit and push to main, and confirm the Timeweb deployment. Review the current price/offer expiration date before reopening.

This closes public access at the application level; it does not stop paid hosting/database resources or pause advertising campaigns.
