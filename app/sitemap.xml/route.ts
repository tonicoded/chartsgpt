import fs from "node:fs";
import path from "node:path";
import { languageAlternates, localeCodes } from "../_lib/locales";

export const dynamic = "force-static";

export function GET() {
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") || "https://charts-gpt.com";

  const languageUrls = Object.entries(languageAlternates).map(([lang, href]) => ({
    lang,
    href: href.replace("https://charts-gpt.com", siteUrl)
  }));
  const ignoredDirs = new Set([
    "app", "public", "node_modules", ".git", ".next", "dev",
    "autoslides", "footmaxxing", "girlmaxxing", "gotem", "prayfirst",
    "smilelock", "soccergpt", "wilddex"
  ]);
  const urlEntries: Array<{
    loc: string;
    lastmod: string;
    changefreq: string;
    priority: number;
    alternates?: typeof languageUrls;
  }> = [];

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
    if (p === "support" || p.endsWith("/support")) return { changefreq: "yearly", priority: 0.3 };
    if (p === "privacy" || p === "terms" || p.endsWith("/privacy") || p.endsWith("/terms")) return { changefreq: "yearly", priority: 0.3 };
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

  const root = urlEntries.find((entry) => entry.loc === `${siteUrl}/`);
  if (root) root.alternates = languageUrls;

  const localizedLastmod = formatDate(new Date());
  for (const locale of localeCodes) {
    urlEntries.push({
      loc: `${siteUrl}/${locale}/`,
      lastmod: localizedLastmod,
      changefreq: "weekly",
      priority: 0.9,
      alternates: languageUrls
    });
  }

  urlEntries.sort((a, b) => a.loc.localeCompare(b.loc));

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urlEntries.map(
      (u) =>
        [
          "  <url>",
          `    <loc>${u.loc}</loc>`,
          `    <lastmod>${u.lastmod}</lastmod>`,
          `    <changefreq>${u.changefreq}</changefreq>`,
          `    <priority>${u.priority.toFixed(1)}</priority>`,
          ...(u.alternates ?? []).map(
            (alternate) => `    <xhtml:link rel="alternate" hreflang="${alternate.lang}" href="${alternate.href}" />`
          ),
          "  </url>"
        ].join("\n")
    ),
    "</urlset>",
    ""
  ].join("\n");

  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
}
