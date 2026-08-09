"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The six tabs from `RootTabView.swift`, in the same order the iOS app shows them. */
const TABS = [
  { href: "/app", label: "Hub" },
  { href: "/app/scan", label: "Scan" },
  { href: "/app/pick", label: "Pick" },
  { href: "/app/chat", label: "Chat" },
  { href: "/app/news", label: "News" },
  { href: "/app/tracker", label: "Tracker" }
] as const;

export default function TabBar() {
  const pathname = usePathname();
  // `trailingSlash: true` is set in next.config.mjs, so pathnames arrive as "/app/scan/".
  const normalized = pathname.replace(/\/+$/, "") || "/app";

  return (
    <nav className="cg-tabs">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="cg-tab"
          aria-current={normalized === tab.href ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
