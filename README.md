# Linkedin Profile API

a single profile api which returns the linkedin profile data

Give it a LinkedIn profile URL, get back structured JSON. It reads from LinkedIn's own
private API (Voyager), not by scraping HTML and not through any third party service.

## Live

**https://linkedin-api.aryanbhati.com**

```bash
curl "https://linkedin-api.aryanbhati.com/profile?url=https://www.linkedin.com/in/aryangajjar"
curl "https://linkedin-api.aryanbhati.com/health"
```

> **Note on the live demo.** LinkedIn auth is session cookies from a logged-in
> account, and those expire and have to be replaced by hand. If the endpoint returns
> `503 UPSTREAM_SESSION_EXPIRED`, the session needs refreshing rather than the code being broken.
> `GET /health` says which it is: `status` is the server, `linkedinSession` is the cookies.
> Running it locally with your own fresh cookies always works — see [Setup](#setup).

## Features

- Full profile data — name, headline, location, about, experience, education, skills,
  certifications, projects, profile images
- Caching
- Rate limiting
- Easy debugging with request IDs
- Field filtering

## Tech

- HonoJs
- Axios
- Typescript

## Setup

```bash
pnpm install
```

Create a `.env`:

```
LI_AT=
JSESSIONID=
PORT=3000
```

Both are cookies from a logged-in LinkedIn session:

1. Log in to LinkedIn
2. DevTools → **Application** → Cookies → `https://www.linkedin.com`
3. Copy `li_at` and `JSESSIONID`

Copy both at the same time. `JSESSIONID` changes on every page reload, so if you grab one and
then refresh, they won't match and every request will fail.

```bash
pnpm dev
```

```
open http://localhost:3000
```

Check the cookies work:

```bash
curl http://localhost:3000/health
```

`"alive"` is good. `"expired"` means grab them again.

## API

### `GET /profile`

| Param     | Required | Description                          |
| --------- | -------- | ------------------------------------ |
| `url`     | yes      | Profile URL, or just the vanity name |
| `fields`  | no       | Comma separated sections             |
| `refresh` | no       | `true` skips the cache               |

Sections: `basics` `experience` `education` `skills` `certifications` `languages` `projects`
`volunteer` `honors` `courses` `publications` `organizations`

```bash
curl "localhost:3000/profile?url=https://www.linkedin.com/in/aryangajjar"
curl "localhost:3000/profile?url=aryangajjar&fields=basics,skills"
```

LinkedIn URLs often have tracking junk on the end (`?trk=...&originalSubdomain=in`). The `&`
cuts the query string short, so URL-encode it or just pass the vanity name.

```json
{
  "success": true,
  "data": {
    "fullName": "Aryan Gajjar",
    "headline": "Student at SSIU'25 | AI Engineer & Software Engineer",
    "location": { "full": "Gandhinagar, Gujarat, India", "countryCode": "IN" },
    "profilePicture": { "url": "https://media.licdn.com/...", "width": 480 },
    "experience": [
      {
        "company": "Postman",
        "dateRange": { "start": { "text": "2023-06" }, "durationMonths": 33 },
        "roles": [
          { "title": "Postman Student Leader" },
          { "title": "Postman Student Expert" }
        ]
      }
    ],
    "skills": ["Full-Stack Development", "Generative AI"]
  },
  "meta": {
    "requestId": "b6c951db-...",
    "cached": false,
    "durationMs": 904
  }
}
```

### `GET /health`

```json
{ "status": "ok", "uptimeSeconds": 128, "linkedinSession": "alive" }
```

### `GET /`

Usage docs.

### Errors

Same shape as a success, so there's only one thing to parse:

```json
{
  "success": false,
  "error": {
    "code": "PROFILE_NOT_FOUND",
    "message": "No accessible profile found"
  },
  "meta": { "requestId": "b6c951db-..." }
}
```

| Code                       | Status |
| -------------------------- | ------ |
| `INVALID_URL`              | 400    |
| `INVALID_FIELDS`           | 400    |
| `PROFILE_NOT_FOUND`        | 404    |
| `RATE_LIMITED`             | 429    |
| `UPSTREAM_SESSION_EXPIRED` | 503    |
| `UPSTREAM_RATE_LIMITED`    | 503    |
| `UPSTREAM_TIMEOUT`         | 504    |
| `UPSTREAM_ERROR`           | 502    |
| `INTERNAL`                 | 500    |

Every response has a `requestId`, and it's in the server logs too. Send that ID and the exact
request can be found.

## How it works

LinkedIn's site is a single page app — it fetches profiles from a private JSON API called
**Voyager**, and that's what this talks to. Auth is just cookies. One request returns the whole
profile, using a `decorationId` that tells LinkedIn what shape to assemble server side.

The response is a flat entity graph rather than nested JSON, so most of the work is walking
URN pointers to rebuild it into something usable.

Full write up, including the traps: **[APPROACH.md](APPROACH.md)**

## Caution Note

- Image URLs are signed and expire after ~90 days (`expiresAt` is in the response)
- `decorationId` is pinned to `FullProfileWithEntities-96`. If LinkedIn retires it, requests
  start redirecting and a new one has to be found
- **Cookies expire and have to be replaced by hand** — `/health` tells you when. This is the main
  reason the hosted demo can go quiet; there is no refresh token to automate
- LinkedIn revokes a session outright (`set-cookie: li_at=delete me`) if requests don't look like
  its own web client — the `x-li-track` fingerprint header turned out to matter, and omitting it
  got an account restricted during development. Every request now carries the full header set the service is active
- Cache and rate limits are in memory, so they reset on restart
- This uses a private API and is against LinkedIn's terms of service. Built as a technical
  exercise — use an account you don't mind losing
