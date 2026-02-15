import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-static";

export function GET() {
  const xml = readFileSync(join(process.cwd(), "public", "feed.xml"), "utf-8");
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}

