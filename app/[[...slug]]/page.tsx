import { notFound } from "next/navigation";
import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import {
  bodyHasClass,
  extractBodyInnerHtml,
  extractCanonical,
  extractMetaContent,
  extractJsonLd,
  extractTitle,
  readLegacyHtml,
  slugToLegacyFile,
  toAbsoluteUrl
} from "../_lib/legacy";

type PageProps = {
  params: { slug?: string[] };
};

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  const ignoredDirs = new Set(["app", "public", "node_modules", ".git"]);

  const slugs: string[][] = [];

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
        slugs.push(segments);
      }
    }
  }

  walk(process.cwd(), []);

  // Optional catch-all expects the root as `{ slug: [] }`.
  // De-dupe and normalize.
  const seen = new Set<string>();
  const params = [];
  for (const slug of slugs) {
    const key = slug.join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    params.push({ slug });
  }

  return params;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug } = props.params;
  const legacyFile = slugToLegacyFile(slug);

  let html: string;
  try {
    html = readLegacyHtml(legacyFile);
  } catch {
    return {};
  }

  const title = extractTitle(html) ?? "ChartsGPT";
  const description = extractMetaContent(html, "description") ?? undefined;
  const canonical = extractCanonical(html) ?? undefined;
  const ogImage = extractMetaContent(html, "og:image") ?? undefined;
  const robotsContent = extractMetaContent(html, "robots") ?? undefined;
  const keywords = extractMetaContent(html, "keywords") ?? undefined;

  const canonicalAbs = canonical ? toAbsoluteUrl(canonical) : undefined;
  const ogImageAbs = ogImage ? toAbsoluteUrl(ogImage) : undefined;

  return {
    title,
    description,
    keywords,
    robots: robotsContent,
    alternates: canonicalAbs ? { canonical: canonicalAbs } : undefined,
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: "ChartsGPT",
      title,
      description,
      url: canonicalAbs,
      images: ogImageAbs ? [{ url: ogImageAbs }] : undefined
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImageAbs ? [ogImageAbs] : undefined
    }
  };
}

export default async function LegacyPage(props: PageProps) {
  const { slug } = props.params;
  const legacyFile = slugToLegacyFile(slug);

  let html: string;
  try {
    html = readLegacyHtml(legacyFile);
  } catch {
    notFound();
  }

  const jsonLd = extractJsonLd(html);
  const bodyInner = extractBodyInnerHtml(html);
  const isBlogLayout = bodyHasClass(html, "blog-body");

  if (isBlogLayout) {
    return (
      <div className="legacy-scroll" suppressHydrationWarning>
        {jsonLd.map((data, index) => (
          <script key={`jsonld-${index}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: data }} />
        ))}
        <div dangerouslySetInnerHTML={{ __html: bodyInner }} />
      </div>
    );
  }

  return (
    <div suppressHydrationWarning>
      {jsonLd.map((data, index) => (
        <script key={`jsonld-${index}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: data }} />
      ))}
      <div dangerouslySetInnerHTML={{ __html: bodyInner }} />
    </div>
  );
}
