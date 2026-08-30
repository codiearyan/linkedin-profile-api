import { Hono } from "hono";
import type { Variables, AppContext } from "./types.js";
import { ApiError } from "./lib/errors.js";
import { requestId, logger } from "./lib/utils.js";
import { probeSession, parseVanity, fetchRawProfile } from "./lib/linkedin.js";
export const app = new Hono<{ Variables: Variables }>();

app.use("*", requestId);
app.use("*", logger);

//routes
app.get("/", (c) =>
  c.json({
    name: "LinkedIn Profile API",
    endpoints: {
      "GET /api/profile": {
        url: "required — a LinkedIn profile URL or bare vanity name",
        fields: "optional — comma-separated sections",
        refresh: "optional — 'true' bypasses the cache",
      },
      "GET /health": "process health and LinkedIn session state",
    },
    example:
      "/profile?url=https://www.linkedin.com/in/aryan&fields=basics,skills",
  }),
);

app.get("/health", async (c) => {
  const sessionAlive = await probeSession();

  return c.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    linkedinSession: sessionAlive ? "alive" : "expired",
  });
});

app.get("/profile", async (c) => {
  const vanity = parseVanity(c.req.query("url") ?? "");
  const profile = await fetchRawProfile(vanity);

  return c.json({
    success: true,
    data: profile,
    meta: {
      requestId: c.get("requestId"),
      vanity,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - c.get("startedAt"),
    },
  });
});

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
