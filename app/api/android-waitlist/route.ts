import { NextResponse } from "next/server";

// Same-origin proxy for the Android beta waitlist.
//
// The browser used to POST straight to supabase.co, which quietly fails on
// networks and phones that block third-party requests. Going through our own
// domain keeps the signup on the same origin the page was already loaded from.
//
// The key below is the publishable (anon) key — it is public by design and row
// level security only grants INSERT on android_waitlist. Env vars override it
// so the project can be pointed elsewhere without a code change.
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://ufzdahsxleztgvioqwwi.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "sb_publishable_Qe7fcj1_UmhPJ7mo698cnA_-j-klqNV";
const TABLE = "android_waitlist";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function trim(value: unknown, max: number) {
  return typeof value === "string" && value ? value.slice(0, max) : null;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 422 });
  }

  const payload = {
    email,
    locale: trim(body.locale, 16),
    source: "website",
    referrer: trim(body.referrer, 512),
    user_agent: trim(request.headers.get("user-agent"), 512)
  };

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "return=minimal"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
  } catch {
    return NextResponse.json({ ok: false, error: "upstream_unreachable" }, { status: 502 });
  }

  if (response.ok) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // 409 = unique violation, i.e. this email already signed up.
  if (response.status === 409) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  return NextResponse.json(
    { ok: false, error: "upstream_failed", status: response.status },
    { status: 502 }
  );
}
