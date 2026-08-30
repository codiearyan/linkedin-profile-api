import axios from "axios";
import type { Context, Next } from "hono";
import { type Variables } from "../types.js";
import { ApiError } from "./errors.js";

const TIMEOUT_MS = 15_000;
export const LINKEDIN_BASE = "https://www.linkedin.com/voyager/api";

export async function logger(c: Context<{ Variables: Variables }>, next: Next) {
  await next();

  const durationMs = Date.now() - c.get("startedAt");
  console.log(
    JSON.stringify({
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    }),
  );
}

export async function requestId(
  c: Context<{ Variables: Variables }>,
  next: Next,
) {
  const id = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("requestId", id);
  c.set("startedAt", Date.now());

  await next();

  // after next() the response exists and is still mutable
  c.header("x-request-id", id);
}

export async function request(
  url: string,
): Promise<{ status: number; body: string; location: string | null }> {
  try {
    const res = await axios.get<string>(url, {
      headers: {},
      timeout: TIMEOUT_MS,
      maxRedirects: 0,
      validateStatus: () => true,
      responseType: "text",
      transformResponse: [(data) => data],
    });

    return {
      status: res.status,
      body: typeof res.data === "string" ? res.data : JSON.stringify(res.data),
      location: (res.headers?.location as string | undefined) ?? null,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;

    if (
      axios.isAxiosError(err) &&
      (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT")
    ) {
      throw new ApiError(
        "UPSTREAM_TIMEOUT",
        504,
        `LinkedIn did not respond within ${TIMEOUT_MS}ms`,
      );
    }

    throw new ApiError("UPSTREAM_ERROR", 502, "Could not reach LinkedIn");
  }
}
