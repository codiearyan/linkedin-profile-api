import { Hono } from "hono";
import type { Variables, AppContext } from "./types.js";
import { ApiError } from "./lib/errors.js";
import { requestId, logger } from "./lib/utils.js";
import { probeSession, parseVanity, fetchRawProfile } from "./lib/linkedin.js";
import { normalizeProfile } from "./lib/normalize.js";
import { cached, invalidate } from "./lib/cache.js";
import { checkClientLimit, checkUpstreamLimit } from "./lib/rate-limit.js";
import { applyFields, parseFields } from "./lib/fields.js";
export const app = new Hono<{ Variables: Variables }>();

app.use("*", requestId);
app.use("*", logger);

//routes
app.get("/health", async (c) => {
  const sessionAlive = await probeSession();

  return c.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    linkedinSession: sessionAlive ? "alive" : "expired",
  });
});

// the api only does one thing, so / and /profile are the same handler
const profile = async (c: AppContext) => {
  checkClientLimit(clientIp(c));

  const vanity = parseVanity(c.req.query("url") ?? "");
  const fields = parseFields(c.req.query("fields"));

  if (c.req.query("refresh") === "true") invalidate(vanity);

  const { value: profile, hit } = await cached(vanity, async () => {
    checkUpstreamLimit();
    return normalizeProfile(await fetchRawProfile(vanity));
  });

  return c.json({
    success: true,
    data: applyFields(profile, fields),
    meta: {
      requestId: c.get("requestId"),
      vanity,
      cached: hit,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - c.get("startedAt"),
    },
  });
};

app.get("/", profile);
app.get("/profile", profile);

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(
      {
        success: false,
        error: { code: err.code, message: err.message },
        meta: { requestId: c.get("requestId") },
      },
      err.status,
    );
  }

  console.error(
    JSON.stringify({
      requestId: c.get("requestId"),
      path: c.req.path,
      error: err.message,
      stack: err.stack,
    }),
  );

  return c.json(
    {
      success: false,
      error: { code: "INTERNAL", message: "Something went wrong on our side" },
      meta: { requestId: c.get("requestId") },
    },
    500,
  );
});

app.notFound((c) =>
  c.json(
    {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `No route for ${c.req.method} ${c.req.path}`,
      },
      meta: { requestId: c.get("requestId") },
    },
    404,
  ),
);

// behind a proxy the real caller is in x-forwarded-for, the socket address is the proxy itself.
// locally there is no such header and every request shares one bucket, which is fine.
function clientIp(c: AppContext): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
