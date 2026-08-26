// Writes public/sitemap.xml.
//
// Why a build step and not app/sitemap.xml/route.ts: next.config.mjs sets
// `trailingSlash: true`, which makes Next redirect /sitemap.xml -> /sitemap.xml/
// and back again, so the route handler is unreachable (400). A file in public/
// is served directly and is the only thing that actually works. This script
// keeps that file in sync so it never drifts from the pages on disk again.
//
// Runs automatically via the `prebuild` npm script.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SITE_URL = (process.env.SITE_URL || "https://charts-gpt.com").replace(/\/$/, "");

// Separate products that share this domain. Listing them here would dilute
// topical relevance and submit thin pages for indexing.
const IGNORED_DIRS = new Set([
  "app", "public", "node_modules", ".git", ".next", "dev", "scripts", "test",
  "autoslides", "footmaxxing", "girlmaxxing", "gotem", "prayfirst",
  "smilelock", "soccergpt", "wilddex", "chain", "lumo", "pnl"
]);

function readLocales() {
  const ts = fs.readFileSync(path.join(ROOT, "app/_lib/locales.ts"), "utf-8");
  const core = ts.slice(ts.indexOf("const coreLocales"), ts.indexOf("export const locales"));

  const out = [];
  const keyRe = /^ {2}"?([a-zA-Z-]+)"?:\s*\{/gm;
  let m;
  while ((m = keyRe.exec(core)) !== null) {
    const hreflang = /hreflang:\s*"([^"]+)"/.exec(core.slice(m.index, m.index + 2000));
    if (hreflang) out.push({ code: m[1], hreflang: hreflang[1] });
  }

  const extra = JSON.parse(
    fs.readFileSync(path.join(ROOT, "app/_lib/additional-locales.generated.json"), "utf-8")
  );
  for (const [code, value] of Object.entries(extra)) {
    if (value?.hreflang) out.push({ code, hreflang: value.hreflang });
  }
  return out;
}

function seoHints(p) {
  if (p === "") return { changefreq: "weekly", priority: 1.0 };
  if (p === "blog") return { changefreq: "weekly", priority: 0.8 };
  if (p.startsWith("blog/")) return { changefreq: "monthly", priority: 0.7 };
  if (p === "about") return { changefreq: "monthly", priority: 0.6 };
  if (p === "support" || p.endsWith("/support")) return { changefreq: "yearly", priority: 0.3 };
  if (p === "privacy" || p === "terms" || p.endsWith("/privacy") || p.endsWith("/terms")) {
    return { changefreq: "yearly", priority: 0.3 };
  }
  return { changefreq: "monthly", priority: 0.5 };
}

const fmt = (d) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

const locales = readLocales();
const alternates = [
  { lang: "x-default", href: `${SITE_URL}/` },
  { lang: "en-US", href: `${SITE_URL}/` },
  ...locales.map((l) => ({ lang: l.hreflang, href: `${SITE_URL}/${l.code}/` }))
];

const entries = [];

(function walk(dir, segments) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(full, [...segments, entry.name]);
    } else if (entry.name === "index.html") {
      const p = segments.join("/");
      entries.push({
        loc: segments.length === 0 ? `${SITE_URL}/` : `${SITE_URL}/${p}/`,
        lastmod: fmt(fs.statSync(full).mtime),
        ...seoHints(p),
        alternates: segments.length === 0 ? alternates : null
      });
    }
  }
})(ROOT, []);

const today = fmt(new Date());
for (const l of locales) {
  entries.push({
    loc: `${SITE_URL}/${l.code}/`,
    lastmod: today,
    changefreq: "weekly",
    priority: 0.9,
    alternates
  });
}

entries.sort((a, b) => a.loc.localeCompare(b.loc));

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...entries.map((u) =>
    [
      "  <url>",
      `    <loc>${u.loc}</loc>`,
      `    <lastmod>${u.lastmod}</lastmod>`,
      `    <changefreq>${u.changefreq}</changefreq>`,
      `    <priority>${u.priority.toFixed(1)}</priority>`,
      ...(u.alternates ?? []).map(
        (a) => `    <xhtml:link rel="alternate" hreflang="${a.lang}" href="${a.href}" />`
      ),
      "  </url>"
    ].join("\n")
  ),
  "</urlset>",
  ""
].join("\n");

fs.writeFileSync(path.join(ROOT, "public/sitemap.xml"), xml);
console.log(`sitemap: ${entries.length} urls, ${locales.length} locales -> public/sitemap.xml`);
