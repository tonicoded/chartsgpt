import fs from "node:fs";
import path from "node:path";

function findFirstMatch(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function slugToLegacyFile(slug: string[] | undefined) {
  if (!slug || slug.length === 0) return "index.html";
  return path.join(...slug, "index.html");
}

export function readLegacyHtml(legacyFile: string) {
  const fullPath = path.join(process.cwd(), legacyFile);
  return fs.readFileSync(fullPath, "utf-8");
}

export function extractBodyInnerHtml(html: string) {
  const body = findFirstMatch(html, [/<body[^>]*>([\s\S]*?)<\/body>/i]);
  return body ?? html;
}

export function extractTitle(html: string) {
  return findFirstMatch(html, [/<title>([\s\S]*?)<\/title>/i]);
}

export function extractMetaContent(html: string, nameOrProperty: string) {
  const escaped = nameOrProperty.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return findFirstMatch(html, [
    new RegExp(`<meta[^>]+name="${escaped}"[^>]+content="([^"]+)"[^>]*>`, "i"),
    new RegExp(`<meta[^>]+property="${escaped}"[^>]+content="([^"]+)"[^>]*>`, "i")
  ]);
}

export function extractCanonical(html: string) {
  return findFirstMatch(html, [/<link[^>]+rel="canonical"[^>]+href="([^"]+)"[^>]*>/i]);
}

export function toAbsoluteUrl(url: string, base = "https://charts-gpt.com") {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${base}${url}`;
  return url;
}

