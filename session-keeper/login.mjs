import { chromium } from "patchright";
import { writeFile } from "node:fs/promises";

const PROFILE = "/home/ubuntu/li-session/profile";
const OUT = "/home/ubuntu/li-session/cookies.json";

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  channel: "chromium",
  viewport: { width: 1480, height: 860 },
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto("https://www.linkedin.com/login", { timeout: 60000 });

console.log("browser is open — log in through VNC now. waiting for li_at ...");

for (;;) {
  const c = await ctx.cookies();
  if (c.find((x) => x.name === "li_at")) break;
  await new Promise((r) => setTimeout(r, 3000));
}
console.log("li_at present — loading feed to settle the session");

await page.goto("https://www.linkedin.com/feed/", { timeout: 60000 });
await page.waitForTimeout(5000);

const jar = await ctx.cookies();
const li = Object.fromEntries(
  jar.filter((c) => c.domain.includes("linkedin.com")).map((c) => [c.name, c.value]),
);
await writeFile(OUT, JSON.stringify(li, null, 2));

console.log(`saved ${Object.keys(li).length} cookies -> ${OUT}`);
console.log(`names: ${Object.keys(li).join(", ")}`);
await ctx.close();
