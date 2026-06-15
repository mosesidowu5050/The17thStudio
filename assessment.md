# Creator Card Microservice — Implementation Notes

## Overview

This project implements a **Creator Card microservice API** using the provided Node.js scaffold template. It exposes three endpoints that allow creators to publish shareable profile cards with links and service rate cards.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/creator-cards` | Create a new Creator Card |
| `GET` | `/creator-cards/:slug` | Retrieve a published card by slug |
| `DELETE` | `/creator-cards/:slug` | Delete a card by slug |

---

## File Structure

```
messages/
  creator-card.js               ← Custom business-rule error messages

models/
  creator-card.js               ← Mongoose model (ULID _id, slug index)

repository/
  creator-card/
    index.js                    ← Repository factory for CreatorCard model

services/
  creator-card/
    create-creator-card.js      ← Create service (validation + slug logic)
    get-creator-card.js         ← Retrieval service (access control)
    delete-creator-card.js      ← Soft-delete service

endpoints/
  creator-cards/
    create.js                   ← POST /creator-cards
    get.js                      ← GET /creator-cards/:slug
    delete.js                   ← DELETE /creator-cards/:slug
```

Core files modified:
- `core/errors/app-error.js` — added `businessCode` support on thrown errors
- `core/errors/constants.js` — corrected `PERMISSION_ERROR` HTTP mapping to 403
- `core/express/server.js` — added `code` field to error response body
- `messages/index.js` — registered `CreatorCardMessages`
- `models/index.js` — registered `CreatorCard` model
- `app.js` — registered `endpoints/creator-cards/` folder

---

## Create Card — `POST /creator-cards`

### Request
```json
{
  "title": "George Cooks",
  "description": "Weekly cooking podcast",
  "slug": "george-cooks",
  "creator_reference": "crt_8f2k1m9x4p7w3q5z",
  "links": [
    { "title": "YouTube", "url": "https://youtube.com/@georgecooks" }
  ],
  "service_rates": {
    "currency": "NGN",
    "rates": [
      { "name": "IG Story Post", "description": "One story mention", "amount": 5000000 }
    ]
  },
  "status": "published",
  "access_type": "public"
}
```

### Response (HTTP 200)
```json
{
  "status": "success",
  "message": "Creator Card Created Successfully.",
  "data": {
    "id": "01JG8XYZA2B3C4D5E6F7G8H9J0",
    "title": "George Cooks",
    "slug": "george-cooks",
    "access_code": null,
    ...
  }
}
```

### Validation
- Field-level rules enforced by the VSL validator (types, lengths, enums)
- `access_type` defaults to `"public"` if omitted
- `access_code` is required when `access_type` is `"private"` → `AC01`
- `access_code` must NOT be set when `access_type` is `"public"` → `AC05`
- `access_code` must be exactly 6 alphanumeric characters
- Slug uniqueness checked in DB → `SL02` if taken
- `access_code` IS included in the creation response (creator needs to know it)

### Slug Auto-Generation
If `slug` is omitted, it is derived from `title`:
1. Lowercase the title
2. Replace whitespace with hyphens
3. Strip non-alphanumeric/hyphen/underscore characters
4. If result is < 5 characters or already taken → append `-` + 6-char random hex suffix

Client-provided slugs that are already taken return `SL02` and are never silently modified.

---

## Retrieve Card — `GET /creator-cards/:slug`

### Access Rules (applied in order)
1. Card not found → **HTTP 404**, code `NF01`
2. Card is a draft → **HTTP 404**, code `NF02`
3. Card is private, no `access_code` query param → **HTTP 403**, code `AC03`
4. Card is private, wrong `access_code` → **HTTP 403**, code `AC04`
5. Otherwise → **HTTP 200**

### Private card access
```
GET /creator-cards/vip-card?access_code=A1B2C3
```

### Response (HTTP 200)
`access_code` is **never** returned in retrieval responses, even for private cards accessed with a valid code.

---

## Delete Card — `DELETE /creator-cards/:slug`

### Request body
```json
{ "creator_reference": "crt_8f2k1m9x4p7w3q5z" }
```

### Behavior
- Card not found → **HTTP 404**, code `NF01`
- On success → **HTTP 200** with the deleted card in the same format as the creation response
- `deleted` field is set to the Unix epoch millisecond timestamp of deletion
- Once deleted, the card returns `NF01` on the retrieval endpoint

---

## Custom Error Codes

| Code | HTTP | Trigger |
|------|------|---------|
| `SL02` | 400 | Provided slug is already taken |
| `AC01` | 400 | `access_code` required for private card |
| `AC05` | 400 | `access_code` set on a public card |
| `NF01` | 404 | Card not found (or deleted) |
| `NF02` | 404 | Card exists but is a draft |
| `AC03` | 403 | Private card accessed without code |
| `AC04` | 403 | Private card accessed with wrong code |

Error responses:
```json
{ "status": "error", "message": "Slug is already taken", "code": "SL02" }
```

---

## Data Model

Stored in MongoDB collection `creator_cards`.

| Field | Type | Notes |
|-------|------|-------|
| `_id` | String (ULID) | Serialized as `id` in all API responses |
| `title` | String | 3–100 chars |
| `description` | String\|null | max 500 chars |
| `slug` | String | unique index |
| `creator_reference` | String | exactly 20 chars |
| `links` | Array | each has `title` + `url` |
| `service_rates` | Mixed\|null | `currency` + `rates[]` |
| `status` | String | `draft` \| `published` |
| `access_type` | String | `public` \| `private` |
| `access_code` | String\|null | 6 alphanumeric, private cards only |
| `created` | Number | Unix ms (set by repository factory) |
| `updated` | Number | Unix ms (set by repository factory) |
| `deleted` | Number\|null | null until deleted |

---

## Environment Variables Required

```
PORT=
MONGODB_URI=
```

See `.env.example` for the full list.

---

## Running Locally

```bash
npm install
# copy .env.example to .env and fill in MONGODB_URI + PORT
npm run dev    # or: node bootstrap.js
```

## Deployment

Deploy to Render / Heroku. Set `MONGODB_URI` and `PORT` as environment variables. The base URL of your deployment is the submission URL — no versioning, no path prefix.

Test endpoint: `POST https://your-app.onrender.com/creator-cards`
