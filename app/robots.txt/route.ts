import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-static";

export function GET() {
  const txt = readFileSync(join(process.cwd(), "public", "robots.txt"), "utf-8");
  return new Response(txt, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

