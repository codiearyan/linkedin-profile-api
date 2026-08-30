import { request, LINKEDIN_BASE } from "./utils.js";

// for checking linkedin cookie expired or not
export async function probeSession(): Promise<boolean> {
  try {
    const res = await request(`${LINKEDIN_BASE}/me`);
    return res.status === 200 && res.body.trim().startsWith("{");
  } catch {
    return false;
  }
}
