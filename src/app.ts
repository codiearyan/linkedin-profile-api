import { Hono } from "hono";
import type { Variables, AppContext } from "./types.js";
import { requestId, logger } from "./lib/utils.js";
import { probeSession } from "./lib/linkedin.js";
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
      "/api/profile?url=https://www.linkedin.com/in/aryan&fields=basics,skills",
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
