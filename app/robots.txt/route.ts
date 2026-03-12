export const dynamic = "force-static";

export function GET() {
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") || "https://charts-gpt.com";
  const txt = [`User-agent: *`, `Allow: /`, ``, `Sitemap: ${siteUrl}/sitemap.xml`, ``].join("\n");
  return new Response(txt, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
