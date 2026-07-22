const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://gcxiaiemgyjhxmwqjgew.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjeGlhaWVtZ3lqaHhtd3FqZ2V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTE4NzQsImV4cCI6MjA5ODM2Nzg3NH0.p96Q1lzl01viGUfTs0jVdid-t7R9jVCqq0xhRPnRnE4";

function parseBody(body) {
  if (typeof body !== "string") return body ?? {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

async function addToWaitlist(email) {
  const result = await fetch(`${SUPABASE_URL}/rest/v1/rpc/join_android_waitlist`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_email: email,
      p_source: "gotem website - Google Play waitlist"
    })
  });

  if (!result.ok) {
    const details = await result.text();
    throw new Error(`Supabase waitlist request failed (${result.status}): ${details}`);
  }

  return result.json();
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ success: false, message: "Method not allowed" });
  }

  const body = parseBody(request.body);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const honeypot = typeof body.website === "string" ? body.website.trim() : "";

  // Quietly accept bot submissions so the endpoint does not teach bots how to bypass it.
  if (honeypot) return response.status(200).json({ success: true });

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return response.status(400).json({ success: false, message: "Enter a valid email address" });
  }

  try {
    const inserted = await addToWaitlist(email);
    return response.status(200).json({ success: true, alreadyRegistered: inserted !== true });
  } catch (error) {
    console.error("Android waitlist storage failed", error);
    return response.status(503).json({ success: false, message: "Waitlist temporarily unavailable" });
  }
}
