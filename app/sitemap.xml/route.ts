import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

export function GET() {
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") || "https://charts-gpt.com";

  const ignoredDirs = new Set(["app", "public", "node_modules", ".git"]);
  const urlEntries: Array<{ loc: string; lastmod: string; changefreq: string; priority: number }> = [];

  function formatDate(date: Date) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function toLoc(segments: string[]) {
    if (segments.length === 0) return `${siteUrl}/`;
    return `${siteUrl}/${segments.join("/")}/`;
  }

  function seoHints(segments: string[]) {
    const p = segments.join("/");
    if (p === "") return { changefreq: "weekly", priority: 1.0 };
    if (p === "blog") return { changefreq: "weekly", priority: 0.8 };
    if (p.startsWith("blog/")) return { changefreq: "monthly", priority: 0.7 };
    if (p === "about") return { changefreq: "monthly", priority: 0.6 };
    if (p === "support") return { changefreq: "yearly", priority: 0.3 };
    if (p === "privacy" || p === "terms") return { changefreq: "yearly", priority: 0.3 };
    return { changefreq: "monthly", priority: 0.5 };
  }

  function walk(dir: string, segments: string[]) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        walk(fullPath, [...segments, entry.name]);
        continue;
      }

      if (entry.isFile() && entry.name === "index.html") {
        const stat = fs.statSync(fullPath);
        const { changefreq, priority } = seoHints(segments);
        urlEntries.push({
          loc: toLoc(segments),
          lastmod: formatDate(stat.mtime),
          changefreq,
          priority
        });
      }
    }
  }

  walk(process.cwd(), []);

  urlEntries.sort((a, b) => a.loc.localeCompare(b.loc));

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlEntries.map(
      (u) =>
        [
          "  <url>",
          `    <loc>${u.loc}</loc>`,
          `    <lastmod>${u.lastmod}</lastmod>`,
          `    <changefreq>${u.changefreq}</changefreq>`,
          `    <priority>${u.priority.toFixed(1)}</priority>`,
          "  </url>"
        ].join("\n")
    ),
    "</urlset>",
    ""
  ].join("\n");

  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
}
