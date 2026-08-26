// Serves /robots.txt in production; Vercel prerenders this handler and routes
// /robots.txt to it. Verified against charts-gpt.com.
//
// Local `next start` bounces /robots.txt -> /robots.txt/ -> 400 because of
// `trailingSlash: true`, and falls back to public/robots.txt. Keep the two in
// sync by hand; they are four lines each.
//
export const dynamic = "force-static";

export function GET() {
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") || "https://charts-gpt.com";
  const txt = [`User-agent: *`, `Allow: /`, ``, `Sitemap: ${siteUrl}/sitemap.xml`, ``].join("\n");
  return new Response(txt, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
