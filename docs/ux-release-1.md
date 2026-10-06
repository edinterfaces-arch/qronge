# UX release 1 — 2026-10-07

First implementation from `competitive-ux-audit-2026-10-07.md`.

## Shipped changes

- Short catalog introduction, no decorative hero image; compact product images and header.
- Two price columns retained. Retail explicitly marked as a comparison; wholesale threshold names the same-model condition. Existing price history retained.
- Wholesale CTA selects 10 units. A separate 3–9-unit action starts negotiated pricing. The quantity field remains editable from 3 to 999.
- Model preselected with an explicit Change action. Single-color selector hidden and its SKU still submitted. Name removed from initial form; backend receives an empty optional name.
- Selected model/quantity included in success confirmation. Existing server confirmation and request-ID retry protection retained.
- Phone recovery link on submission failure; keyboard focus returns to opener when closing the dialog.
- Permanent product-detail links; larger mobile action text. Address header points to contacts.
- H2 for the catalog and consistent QRONGE/Южные ворота category titles.
- Consent notice shortened while keeping explicit accept/decline choices and privacy link.

## Analytics

Existing `lead_success` remains the primary confirmed-lead goal. No sale or revenue is inferred from a lead.

Events added: `product_impression`, `product_click`, `product_view`, `lead_start`, `lead_validation_error`, `lead_error`. `lead_open` now includes placement, quantity and initial price mode. Existing phone and submit-click events remain.

For goal-based reports, add JavaScript-event goals with these exact identifiers in Metrika. Product impressions/click/detail are also emitted to the existing ecommerce dataLayer. This release does not change the Metrika account settings.

Visible impressions require at least 50% of the card for one continuous second in a visible tab. Each card is counted once per document; use visit/model/list grouping when calculating visit-based CTR. No hover tracking in this release. A normal product-link navigation waits at most 200 ms for its goal callback; modifier clicks keep normal browser behavior.

Events begin only after analytics consent. Form fields and server error text are not included; errors use bounded categories. Do not divide all DB leads by consent-limited Metrika visits as if both covered the same population.

## Scope and verification

No new dependencies, no database schema changes, no price/specification edits. Sorting, model comparison, gallery work and the broader PDP redesign remain for later releases.

Source diff reviewed. No automated tests, browser verification or test lead submission performed in this implementation turn. Automatic GitHub/Timeweb runs are separate from this record; a Git push does not by itself establish successful deployment.

## Rollback

Revert the release commit to restore prior markup/styles/client behavior. No database rollback is needed.
