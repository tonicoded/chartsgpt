import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "../styles.css";

export const viewport: Viewport = {
  themeColor: "#030303",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1
};

export const metadata: Metadata = {
  metadataBase: new URL("https://charts-gpt.com"),
  applicationName: "ChartsGPT",
  title: {
    default: "ChartsGPT — AI-Powered Trading Chart Analysis App",
    template: "%s — ChartsGPT"
  },
  description:
    "Upload a trading chart screenshot for instant AI analysis with trend, key levels, entry, stop loss, and invalidation. For crypto, forex, stocks, and metals.",
  category: "finance",
  creator: "ChartsGPT",
  publisher: "ChartsGPT",
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": [{ url: "/feed.xml", title: "ChartsGPT Blog" }]
    }
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
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
  keywords: [
    "AI chart analysis", "trading chart analyzer", "chart screenshot analysis",
    "AI trading app", "technical analysis AI", "crypto chart analysis",
    "forex chart analyzer", "stock chart AI", "support resistance levels AI",
    "trading setup ideas", "chart pattern recognition"
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "ChartsGPT",
    title: "ChartsGPT — AI-Powered Trading Chart Analysis App",
    description:
      "Upload a trading chart screenshot for instant AI analysis with trend, key levels, entry, stop loss, and invalidation. For crypto, forex, stocks, and metals.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ChartsGPT AI chart analysis app" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "ChartsGPT — AI-Powered Trading Chart Analysis App",
    description:
      "Upload any trading chart screenshot and get instant AI analysis: key support & resistance levels, bullish/bearish scenarios, entry triggers, and invalidation points.",
    images: ["/og.png"]
  },
  formatDetection: {
    telephone: false
  },
  itunes: {
    appId: "6758857719",
    appArgument: "https://apps.apple.com/app/chartsgpt-trading-assistant/id6758857719"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Above-the-fold faces only: Geist-Bold draws the hero headline and
            Geist-Regular the body copy. The rest load on demand. */}
        <link rel="preload" href="/Geist-Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/Geist-Bold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <Script src="/site-config.js" strategy="afterInteractive" />
        <Script src="/site.js?v=20260808b" strategy="afterInteractive" />
        <Analytics />
      </body>
    </html>
  );
}
