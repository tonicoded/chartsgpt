import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "../styles.css";

export const viewport: Viewport = {
  themeColor: "#070a12",
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
    "Upload any trading chart screenshot and get instant AI analysis: key support & resistance levels, bullish/bearish scenarios, entry triggers, and invalidation points. Works for crypto, forex, stocks, and metals.",
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
      "Upload any trading chart screenshot and get instant AI analysis: key support & resistance levels, bullish/bearish scenarios, entry triggers, and invalidation points. Works for crypto, forex, stocks, and metals."
  },
  twitter: {
    card: "summary_large_image",
    title: "ChartsGPT — AI-Powered Trading Chart Analysis App",
    description:
      "Upload any trading chart screenshot and get instant AI analysis: key support & resistance levels, bullish/bearish scenarios, entry triggers, and invalidation points."
  },
  formatDetection: {
    telephone: false
  },
  other: {
    "apple-itunes-app": "app-id=6758857719"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script src="/site-config.js" strategy="afterInteractive" />
        <Script src="/site.js?v=20260324b" strategy="afterInteractive" />
        <Analytics />
      </body>
    </html>
  );
}
