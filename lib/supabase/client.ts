"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 *
 * Points at the same project the iOS app calls, so the web app reuses the existing edge
 * functions (`openai-proxy`, `news-scan`, `support-chat`, …) rather than duplicating them.
 * Only the anon key is exposed here — every privileged operation stays behind an edge
 * function or a route handler.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
