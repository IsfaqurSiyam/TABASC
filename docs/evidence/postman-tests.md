# Postman negative and role tests

The **6 - Negative and Role Tests** folder contains request definitions only; none were sent against a server or real data. Requests assert both the expected status and the API's JSON error shape (`message` and `code`), then check the specific error.

| Request | Expected result | Route/rule proved |
|---|---|---|
| No Token - Protected Endpoint | `401`, `UNAUTHORIZED`; `message: "No token provided"` | `GET /api/products` requires a bearer token. |
| Invalid Token - Protected Endpoint | `401`, `UNAUTHORIZED`; `message: "Not authorised"` | `GET /api/products` rejects an invalid or expired JWT. The request uses a deliberately invalid, non-secret token string. |
| Wrong Role - Register Product | `403`, `FORBIDDEN`; farmer-only registration message | `POST /api/products/register` is protected and only an approved farmer may register. |
| Missing Fields - Register Product | `400`, `VALIDATION_ERROR`; `message: "name is required"` | The required `name` field is validated on `POST /api/products/register`. |
| Duplicate Action - Confirm Buyer | `409`, `BUYER_ALREADY_CONFIRMED` | `POST /api/tracking/:id/buyer/confirm` maps the duplicate confirmation to `BUYER_ALREADY_CONFIRMED`. Requires a sold product whose buyer assignment has already been confirmed by the consumer. |
| Restricted Recipient - Handover | `403`, `RECIPIENT_RESTRICTED` | `POST /api/products/:id/handover` rejects an active, approved distributor marked restricted by the trust system. Requires a harvested product currently held by the farmer. |
| Feedback After Recall | `409`, `PRODUCT_RECALLED` | `POST /api/reputation/reviews` checks the recalled state before buyer eligibility. Requires a sold, recalled product with a known batch ID and a consumer token. |
| Public Verify - Unknown Product | `404`, `PRODUCT_NOT_FOUND` | Public `GET /api/verify/:blockchainId` returns not found for a valid positive ID with no active matching product. |

## Environment and fixture variables

Set `base_url` and the role-specific token variables in a local Postman environment; do not place real credentials in this collection or this document. The token placeholders required by these requests are `consumer_token` and `farmer_token`. Use a consumer account for the consumer token and a farmer account for the farmer token. Existing collection requests continue to use `token`.

The state-dependent requests require API fixtures: `sold_product_id`, `harvested_product_id`, `restricted_distributor_email`, and `recalled_sold_batch_id`. The duplicate-confirmation fixture must already have a consumer-confirmed buyer; the restricted distributor must be a valid active recipient that the trust system marks restricted; the recalled batch must refer to a sold, recalled product. The missing-fields request and public unknown-ID request do not require fixtures.
