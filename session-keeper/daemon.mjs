import { chromium } from "patchright";
import { writeFile } from "node:fs/promises";

const PROFILE = "/home/ubuntu/li-session/profile";
const OUT = "/home/ubuntu/li-session/cookies.json";
const REFRESH_MS = 5 * 60 * 1000;

const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  channel: "chromium",
  viewport: { width: 1480, height: 860 },
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
});

const page = ctx.pages()[0] ?? (await ctx.newPage());

/**
 * Loads the real feed, then writes every linkedin cookie to disk.
 * The page load is the point: it is what keeps short-lived cookies like lidc current and makes
 * the session look used rather than parked.
 */
async function refresh() {
  try {
    await page.goto("https://www.linkedin.com/feed/", {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(4000);

    const jar = await ctx.cookies();
    const li = Object.fromEntries(
      jar.filter((c) => c.domain.includes("linkedin.com")).map((c) => [c.name, c.value]),
    );

    if (!li.li_at) {
      log({ event: "session_lost", note: "li_at gone - needs manual re-login over vnc" });
      return;
    }

    await writeFile(OUT, JSON.stringify(li, null, 2));
    log({ event: "cookies_refreshed", count: Object.keys(li).length });
  } catch (err) {
    log({ event: "refresh_failed", error: String(err).slice(0, 200) });
  }
}

await refresh();
setInterval(refresh, REFRESH_MS);
log({ event: "daemon_started", refreshMinutes: REFRESH_MS / 60000 });
