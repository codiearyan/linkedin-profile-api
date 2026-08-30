import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { app } from "./app.js";
// import { env } from "hono/adapter";

// type Bindings = {
//   PORT: string;
// };

// const app = new Hono<{ Bindings: Bindings }>();

const PORT: number | string = process.env.PORT || 3000;

app.get("/", (c) => {
  return c.text(`Linkedin Profile API`);
});

serve(
  {
    fetch: app.fetch,
    port: Number(PORT),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
