import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "../styles.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://charts-gpt.com"),
  applicationName: "ChartsGPT",
  title: {
    default: "ChartsGPT — AI Chart Analyzer",
    template: "%s — ChartsGPT"
  },
  description:
    "Scan any trading chart screenshot and get clean AI analysis with key levels, scenarios, triggers, and invalidation in seconds.",
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
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "ChartsGPT",
    title: "ChartsGPT — AI Chart Analyzer",
    description:
      "Scan any trading chart screenshot and get clean AI analysis with key levels, scenarios, triggers, and invalidation in seconds."
  },
  twitter: {
    card: "summary_large_image",
    title: "ChartsGPT — AI Chart Analyzer",
    description:
      "Scan any trading chart screenshot and get clean AI analysis with key levels, scenarios, triggers, and invalidation in seconds."
  },
  themeColor: "#070a12",
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
        <Script src="/site.js" strategy="afterInteractive" />
        <Analytics />
      </body>
    </html>
  );
}
