# Linkedin Profile API

a single profile api which returns the linkedin profile data

Give it a LinkedIn profile URL, get back structured JSON. It reads from LinkedIn's own
private API (Voyager), not by scraping HTML and not through any third party service.

## Live

**https://linkedin-api.aryanbhati.com**

```bash
curl "https://linkedin-api.aryanbhati.com/?url=https://www.linkedin.com/in/aryangajjar"
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

The API needs a logged-in LinkedIn session. There are two ways to give it one.

### Quick — copy the cookies by hand

Fine for running it locally.

```
LI_AT=
JSESSIONID=
PORT=3000
```

1. Log in to LinkedIn
2. DevTools → **Application** → Cookies → `https://www.linkedin.com`
3. Copy `li_at` and `JSESSIONID`

Copy both at the same moment. `JSESSIONID` changes on every page reload, so grabbing one and then
refreshing gives you a mismatched pair that fails every request.

Expect these to stop working within hours. LinkedIn revokes sessions whose requests don't look
like its own web client, and two hand-copied cookies out of the two dozen a browser sends is one
of the things it notices.

### Durable — the session keeper

This is how the deployment runs. A real Chromium stays logged in on the server and rewrites the
whole cookie jar every five minutes, so nothing is copied by hand and short-lived cookies like
`lidc` stay current. See [APPROACH.md](APPROACH.md) for why.

```
LI_COOKIE_FILE=/home/ubuntu/li-session/cookies.json
PORT=3000
```

`LI_COOKIE_FILE` takes priority over `LI_AT` / `JSESSIONID` when both are set.

Setting it up on a server, from [`session-keeper/`](session-keeper):

```bash
sudo apt install -y xvfb x11vnc openbox
mkdir -p ~/li-session && cp session-keeper/* ~/li-session/
cd ~/li-session && npm install && npx playwright install --with-deps chromium
```

Log in once, through a virtual display you can see over VNC:

```bash
# on the server
x11vnc -storepasswd <password> ~/.vnc/passwd
DISPLAY=:99 node login.mjs

# from your machine
ssh -L 5900:localhost:5900 -N ubuntu@<server>
open vnc://localhost:5900
```

The browser window appears; log in there. It waits for `li_at`, loads the feed, and writes
`cookies.json`. That login is bound to the server's own IP, which matters — a session created
elsewhere and replayed from a datacenter looks like a stolen one.

Then run the keeper as a service:

```bash
sudo cp session-keeper/li-session.service /etc/systemd/system/
sudo systemctl enable --now li-session
journalctl -u li-session -f -o cat
```

It logs `cookies_refreshed` every five minutes, and `session_lost` if the login lapses and needs
doing again.

### Run it

```bash
pnpm dev
```

```
open http://localhost:3000
```

Check the session works:

```bash
curl http://localhost:3000/health
```

`"alive"` is good. `"expired"` means the cookies need replacing, or the keeper needs a re-login.

## API

### `GET /profile` · `GET /`

Both paths are the same handler.

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

A **session keeper** handles the fragile part: a real logged-in Chromium runs on the server and
refreshes the full cookie jar every five minutes, so the API never depends on hand-copied cookies.

Full write up, including the traps and prior-art credit: **[APPROACH.md](APPROACH.md)**

This new approach of using a **session keeper** is built on [mguttmann/linkedin-internal-api](https://github.com/mguttmann/linkedin-internal-api) (MIT).

## Caution Note

- Image URLs are signed and expire after ~90 days (`expiresAt` is in the response)
- `decorationId` is pinned to `FullProfileWithEntities-96`. If LinkedIn retires it, requests
  start redirecting and a new one has to be found
- **Sessions are the fragile part.** The session keeper refreshes cookies automatically, but if
  LinkedIn revokes the session or the login lapses, it needs a manual re-login on the server.
  `/health` reports which state it is in — this is the usual reason the hosted demo goes quiet
- LinkedIn revokes a session outright (`set-cookie: li_at=delete me`) if requests don't look like
  its own web client — the `x-li-track` fingerprint header turned out to matter, and omitting it
  got an account restricted during development. Every request now carries the full header set
- Cache and rate limits are in memory, so they reset on restart
- This uses a private API and is against LinkedIn's terms of service. Built as a technical
  exercise — use an account you don't mind losing
