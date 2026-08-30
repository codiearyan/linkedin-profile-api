import { ApiError } from "./errors.js";
import { request, LINKEDIN_BASE } from "./utils.js";

const DECORATION =
  "com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-96";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

// JSESSIONID needs to be sent back as the csrf-token header or every call is a 403.
function headers(): Record<string, string> {
  const liAt = process.env.LI_AT;
  const jsessionId = process.env.JSESSIONID;

  if (!liAt || !jsessionId) {
    throw new ApiError(
      "UPSTREAM_SESSION_EXPIRED",
      503,
      "LI_AT and JSESSIONID are not set",
    );
  }

  const csrf = jsessionId.replace(/"/g, "");

  return {
    "csrf-token": csrf,
    "x-restli-protocol-version": "2.0.0",
    // linkedin reply with the flat { data, included[] } graph
    accept: "application/vnd.linkedin.normalized+json+2.1",
    "x-li-lang": "en_US",
    // the tracking blob every real voyager-web request carries. leaving it out is what makes a
    // request look scripted, and linkedin answers that by revoking the session outright
    // (set-cookie: li_at=delete me) rather than just refusing the one call.
    "x-li-track": JSON.stringify({
      clientVersion: "1.13.45173",
      mpVersion: "1.13.45173",
      osName: "web",
      timezoneOffset: 5.5,
      timezone: "Asia/Kolkata",
      deviceFormFactor: "DESKTOP",
      mpName: "voyager-web",
      displayDensity: 2,
      displayWidth: 1512,
      displayHeight: 982,
    }),
    "user-agent": USER_AGENT,
    cookie: `li_at=${liAt}; JSESSIONID="${csrf}"`,
    referer: "https://www.linkedin.com/feed/",
    origin: "https://www.linkedin.com",
  };
}

// a 302 is overloaded and the location header does not tell the cases apart, linkedin answers a
// dead session by redirecting back to the same url we asked for, which looks identical to a
// profile we are not allowed to see. so ask whether the session is alive instead of guessing,
// otherwise you send people off refreshing cookies that were never the problem.
async function explainRedirect(location: string | null, vanity: string) {
  if (/\/(uas\/login|checkpoint|authwall)/.test(location ?? "")) {
    return sessionExpired();
  }
  if (!(await probeSession())) return sessionExpired();

  return notFound(vanity);
}

function sessionExpired() {
  return new ApiError(
    "UPSTREAM_SESSION_EXPIRED",
    503,
    "LinkedIn session expired, cookies need refreshing",
  );
}

function notFound(vanity: string) {
  return new ApiError(
    "PROFILE_NOT_FOUND",
    404,
    `No accessible profile found for "${vanity}"`,
  );
}

// for checking linkedin cookie expired or not
export async function probeSession(): Promise<boolean> {
  try {
    const res = await request(`${LINKEDIN_BASE}/me`, headers());
    return res.status === 200 && res.body.trim().startsWith("{");
  } catch {
    return false;
  }
}

export async function fetchRawProfile(vanity: string): Promise<any> {
  const params = new URLSearchParams({
    q: "memberIdentity",
    memberIdentity: vanity,
    decorationId: DECORATION,
  });

  const { status, body, location } = await request(
    `${LINKEDIN_BASE}/identity/dash/profiles?${params}`,
    headers(),
  );

  if (status === 302) throw await explainRedirect(location, vanity);
  if (status === 401) throw sessionExpired();
  if (status === 404) throw notFound(vanity);

  if (status === 429) {
    throw new ApiError(
      "UPSTREAM_RATE_LIMITED",
      503,
      "LinkedIn is rate limiting this session",
    );
  }

  if (status !== 200) {
    throw new ApiError("UPSTREAM_ERROR", 502, `LinkedIn returned ${status}`);
  }

  if (!body.trim().startsWith("{")) throw sessionExpired();

  const payload = JSON.parse(body);
  if (!payload?.included?.length) throw notFound(vanity);

  return payload;
}

export function parseVanity(input: string): string {
  const trimmed = input.trim();
  if (!trimmed)
    throw new ApiError("INVALID_URL", 400, "Query parameter 'url' is required");
  if (!trimmed.includes("/")) return trimmed;

  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    const match = url.pathname.match(/\/in\/([^/]+)/);
    if (!match) throw new Error();
    return decodeURIComponent(match[1]!);
  } catch {
    throw new ApiError(
      "INVALID_URL",
      400,
      `Not a LinkedIn profile URL: ${input}`,
    );
  }
}
