import { ApiError } from "./errors.js";

const WINDOW_MS = 60_000;
const PER_IP_LIMIT = 20;
const UPSTREAM_LIMIT = 30;

type Window = { count: number; resetAt: number };

const perIp = new Map<string, Window>();
let upstream: Window = { count: 0, resetAt: Date.now() + WINDOW_MS };

// two counters because they guard different things. the per ip limit is about fairness between
// callers. the upstream one is the important one, it caps how fast anyone in total can make us
// call linkedin. the scarce resource here is not cpu, it is one session cookie that gets the
// account restricted if it behaves like a bot, and a per ip limit alone would not protect it
// when many clients show up at once.
export function checkClientLimit(ip: string) {
  const next = take(perIp.get(ip), PER_IP_LIMIT);
  perIp.set(ip, next.window);

  if (!next.allowed) {
    throw new ApiError(
      "RATE_LIMITED",
      429,
      "Too many requests, try again in a minute",
    );
  }
}

// called right before a real linkedin request and never on a cache hit, a response served from
// cache costs the session nothing so it must not spend the upstream budget
export function checkUpstreamLimit() {
  const next = take(upstream, UPSTREAM_LIMIT);
  upstream = next.window;

  if (!next.allowed) {
    throw new ApiError(
      "UPSTREAM_RATE_LIMITED",
      503,
      "Upstream request budget exhausted, try again shortly",
    );
  }
}

function take(
  window: Window | undefined,
  limit: number,
): { window: Window; allowed: boolean } {
  const now = Date.now();

  if (!window || window.resetAt <= now) {
    return { window: { count: 1, resetAt: now + WINDOW_MS }, allowed: true };
  }

  return {
    window: { count: window.count + 1, resetAt: window.resetAt },
    allowed: window.count < limit,
  };
}
