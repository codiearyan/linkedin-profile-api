# How it works

How the LinkedIn API was reverse engineered, and why the code is shaped the way it is.

LinkedIn's site is a single page app. It doesn't render profiles from HTML, it fetches them
from a private JSON API called **Voyager**. That's what this talks to.

**Auth is cookies, not an API key.** `li_at` is the session. `JSESSIONID` has to be echoed back
as a `csrf-token` header or everything is a 403.

**One request per profile.** The trick is `decorationId` — you name a shape and LinkedIn builds
it server side. `FullProfileWithEntities` returns positions, education, skills and
certifications together, so no follow up calls.

The website uses a GraphQL route instead, but its query ID has a hash that changes every time
LinkedIn deploys. The REST endpoint with a decoration is much more stable.

**The response is a flat entity graph, not nested JSON.** Everything sits in one `included[]`
array, and relationships are `*` prefixed fields holding URNs pointing back into it. Lists add
another hop through a collection object whose `*elements` holds the real URNs in LinkedIn's own
display order. `src/lib/graph.ts` walks that graph.

Things that aren't obvious:

- A `302` means four different things, so the API checks if the session is alive instead of
  guessing from the redirect
- A `200` isn't always success — a dead session returns 200 with an HTML login page

**Caching protects the session** more than it speeds things up. Profiles are cached an hour, and
simultaneous requests for the same profile share one call to LinkedIn. Cache hits don't count
against the LinkedIn rate limit.

**The URL you send is never fetched.** Only the vanity name is taken from it. Otherwise
`?url=http://169.254.169.254/` would read the server's cloud metadata.

## Keeping the session alive

Copied cookies were a weak point. A browser sends around two dozen cookies and several of them,
`lidc` in particular, are short lived — so a hand-copied pair is already incomplete when you paste
it and stale soon after. LinkedIn's response to a request that doesn't look like its own web
client isn't a 401, it's `set-cookie: li_at=delete me` with a 1970 expiry: the session is revoked
server side, which logs out the browser that created it too.

So now in this new approach, server runs a **session keeper** rather than holding a static credential:

- A real Chromium, logged in from the server's own IP, kept open under Xvfb with a persistent
  profile (patchright, so `navigator.webdriver` is false and the UA carries no "Headless")
- A daemon that reloads `/feed/` every five minutes and writes every LinkedIn cookie to
  `cookies.json` — the page load is the point, it keeps short-lived cookies current and makes the
  session look used rather than parked
- The API reads that file per request via `LI_COOKIE_FILE`, so it always sends a complete jar
  that is at most five minutes old

The browser never fetches profiles. It exists only to keep a genuine session alive; the profile
calls are still plain HTTP.

## Prior art

The starting point for the reverse engineering was
**[mguttmann/linkedin-internal-api](https://github.com/mguttmann/linkedin-internal-api)** (MIT),
a documented reference for LinkedIn's private API. Credit where it's due — three things came from
there:

- The `identity/dash/profiles?q=memberIdentity&decorationId=…FullProfileWithEntities-96` endpoint,
  and the insight that a REST decoration is more stable than the GraphQL route the web client
  uses, whose `queryId` hash changes on every LinkedIn deploy
- The header requirements — `JSESSIONID` echoed as `csrf-token`, `x-restli-protocol-version`, and
  the `application/vnd.linkedin.normalized+json+2.1` accept header that produces the entity graph
- The browserless-first architecture: a stealth browser as the _session source_ only, with all
  API calls made over plain HTTP

The widely forked [`linkedin-api`](https://github.com/tomquirk/linkedin-api) was also looked at,
but it predates LinkedIn's move to the `dash` namespace — it still calls
`/identity/profiles/{id}/profileView`, which no longer resolves.

Everything else here is original: the TypeScript client, the entity-graph normalizer, the API
layer with its caching, coalescing, rate limiting and error model, and the diagnosis of the
revocation behaviour above, which came from reading response headers rather than from any
existing write-up.
