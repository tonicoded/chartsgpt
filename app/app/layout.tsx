import type { Metadata } from "next";
import Link from "next/link";
import "./chartgpt.css";
import { createClient } from "../../lib/supabase/server";
import SignOutButton from "./_components/SignOutButton";
import TabBar from "./_components/TabBar";

export const metadata: Metadata = {
  title: "ChartsGPT Web",
  description: "Run the ChartsGPT analysis engine from the browser.",
  robots: { index: false, follow: false }
};

// The marketing pages in this repo are statically generated; the app is per-user.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <div className="cg-root">
      <div className="cg-shell">
        <header className="cg-header">
          <Link href="/app" className="cg-wordmark">
            Charts<span>GPT</span>
          </Link>
          {user ? (
            <div className="cg-row">
              <span className="cg-muted">{user.email}</span>
              <SignOutButton />
            </div>
          ) : null}
        </header>

        {user ? <TabBar /> : null}

        {children}
      </div>
    </div>
  );
}
