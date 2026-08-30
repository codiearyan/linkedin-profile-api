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
