import type { Context } from "hono";

export type Variables = {
  requestId: string;
  startedAt: number;
};

export type AppContext = Context<{ Variables: Variables }>;
