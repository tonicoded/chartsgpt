import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  extractBodyInnerHtml,
  extractCanonical,
  extractMetaContent,
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
  return [
    { slug: [] },
    { slug: ["about"] },
    { slug: ["privacy"] },
    { slug: ["terms"] },
    { slug: ["support"] },
    { slug: ["blog"] },
    { slug: ["blog", "pillars"] },
    { slug: ["blog", "ai-trading-chart-analysis"] },
    { slug: ["blog", "best-ai-chart-analyzer-2026"] },
    { slug: ["blog", "best-support-and-resistance-strategy"] },
    { slug: ["blog", "break-and-retest-crypto"] },
    { slug: ["blog", "how-to-find-key-levels-day-trading"] },
    { slug: ["blog", "position-sizing-calculator"] },
    { slug: ["blog", "trading-plan-template"] },
    { slug: ["blog", "support-and-resistance"] },
    { slug: ["blog", "break-and-retest"] },
    { slug: ["blog", "market-structure-bos-choch"] },
    { slug: ["blog", "rsi-divergence"] },
    { slug: ["blog", "candlestick-patterns-that-matter"] },
    { slug: ["blog", "moving-averages-strategy"] },
    { slug: ["blog", "risk-management-position-sizing"] },
    { slug: ["blog", "crypto-vs-stocks-volatility"] },
    { slug: ["blog", "gold-and-silver-trading"] }
  ];
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

  const canonicalAbs = canonical ? toAbsoluteUrl(canonical) : undefined;
  const ogImageAbs = ogImage ? toAbsoluteUrl(ogImage) : undefined;

  return {
    title,
    description,
    alternates: canonicalAbs ? { canonical: canonicalAbs } : undefined,
    openGraph: {
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

  const bodyInner = extractBodyInnerHtml(html);

  return <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: bodyInner }} />;
}
