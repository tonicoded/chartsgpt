import { notFound } from "next/navigation";
import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import {
  bodyHasClass,
  extractBodyClass,
  extractBodyInnerHtml,
  extractCanonical,
  extractMetaContent,
  extractJsonLd,
  extractTitle,
  readLegacyHtml,
  slugToLegacyFile,
  toAbsoluteUrl
} from "../_lib/legacy";
import GotemGameplay from "../_components/GotemGameplay";
import LocalizedLanding from "../_components/LocalizedLanding";
import {
  APP_STORE_URL,
  SITE_URL,
  isLocaleCode,
  languageAlternates,
  localeCodes,
  locales
} from "../_lib/locales";

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

  for (const locale of localeCodes) {
    const key = locale;
    if (seen.has(key)) continue;
    seen.add(key);
    params.push({ slug: [locale] });
  }

  return params;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug } = props.params;
  const localeCode = slug?.length === 1 && isLocaleCode(slug[0]) ? slug[0] : null;

  if (localeCode) {
    const content = locales[localeCode];
    const canonical = `${SITE_URL}/${localeCode}/`;

    return {
      title: { absolute: content.title },
      description: content.description,
      keywords: content.keywords,
      category: "finance",
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1
        }
      },
      alternates: { canonical, languages: languageAlternates },
      openGraph: {
        type: "website",
        locale: content.ogLocale,
        alternateLocale: localeCodes.filter((code) => code !== localeCode).map((code) => locales[code].ogLocale),
        siteName: "ChartsGPT",
        title: content.title,
        description: content.description,
        url: canonical,
        images: [{ url: "/og.png", width: 1200, height: 630, alt: "ChartsGPT AI chart analysis" }]
      },
      twitter: {
        card: "summary_large_image",
        title: content.title,
        description: content.description,
        images: ["/og.png"]
      },
      other: {
        "apple-itunes-app": `app-id=6758857719, app-argument=${APP_STORE_URL}`,
        "content-language": content.lang
      }
    };
  }

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
  const isGotem = slug?.[0] === "gotem";
  const isPrayFirst = slug?.[0] === "prayfirst";
  const isChartsGptHome = !slug || slug.length === 0;
  const standaloneSiteName = isGotem ? "gotem" : isPrayFirst ? "pray first" : null;

  // Legacy pages author their own brand suffix in <title>. Letting the layout
  // template append " — ChartsGPT" on top of that rendered every blog post as
  // "… — ChartsGPT — ChartsGPT", so a title that already carries the brand is
  // passed through untouched.
  const alreadyBranded = /ChartsGPT/i.test(title);

  return {
    // Standalone products keep their browser title and social previews free of
    // the ChartsGPT title template and app metadata.
    title:
      standaloneSiteName || isChartsGptHome || alreadyBranded
        ? { absolute: title }
        : title,
    description,
    keywords,
    robots: robotsContent,
    other: standaloneSiteName ? undefined : { "apple-itunes-app": "app-id=6758857719" },
    alternates: canonicalAbs
      ? { canonical: canonicalAbs, ...(isChartsGptHome ? { languages: languageAlternates } : {}) }
      : undefined,
    openGraph: {
      type: "website",
      locale: "en_US",
      alternateLocale: isChartsGptHome ? localeCodes.map((code) => locales[code].ogLocale) : undefined,
      siteName: standaloneSiteName ?? "ChartsGPT",
      title,
      description,
      url: canonicalAbs,
      images: isChartsGptHome
        ? [{ url: `${SITE_URL}/og.png`, width: 1200, height: 630, alt: "ChartsGPT AI chart analysis" }]
        : ogImageAbs
          ? [{ url: ogImageAbs }]
          : undefined
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: isChartsGptHome ? [`${SITE_URL}/og.png`] : ogImageAbs ? [ogImageAbs] : undefined
    }
  };
}

export default async function LegacyPage(props: PageProps) {
  const { slug } = props.params;
  const localeCode = slug?.length === 1 && isLocaleCode(slug[0]) ? slug[0] : null;
  if (localeCode) return <LocalizedLanding content={locales[localeCode]} />;

  const isGotem = slug?.[0] === "gotem";
  const isChartsGptHome = !slug || slug.length === 0;
  const legacyFile = slugToLegacyFile(slug);

  let html: string;
  try {
    html = readLegacyHtml(legacyFile);
  } catch {
    notFound();
  }

  const jsonLd = extractJsonLd(html);
  const bodyInner = extractBodyInnerHtml(html);
  const bodyClassName = extractBodyClass(html);
  const isBlogLayout = bodyHasClass(html, "blog-body");

  if (isBlogLayout) {
    return (
      <div className={`legacy-scroll ${bodyClassName}`.trim()} suppressHydrationWarning>
        {jsonLd.map((data, index) => (
          <script key={`jsonld-${index}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: data }} />
        ))}
        <div dangerouslySetInnerHTML={{ __html: bodyInner }} />
      </div>
    );
  }

  return (
    <div className={bodyClassName || undefined} suppressHydrationWarning>
      {isChartsGptHome ? (
        // LCP element on the homepage. React hoists this into <head>; the
        // legacy file's own <head> is dropped, so it cannot live there.
        <link
          rel="preload"
          as="image"
          type="image/webp"
          href="/screen2-900.webp"
          imageSrcSet="/screen2-600.webp 600w, /screen2-900.webp 900w"
          imageSizes="(max-width: 860px) 40vw, 290px"
          fetchPriority="high"
        />
      ) : null}
      {jsonLd.map((data, index) => (
        <script key={`jsonld-${index}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: data }} />
      ))}
      <div dangerouslySetInnerHTML={{ __html: bodyInner }} />
      {isGotem ? <GotemGameplay /> : null}
    </div>
  );
}
