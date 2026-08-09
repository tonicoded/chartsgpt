"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "../../../lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.replace("/app/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="cg-button cg-button-secondary"
      style={{ width: "auto", padding: "8px 14px", fontSize: 14 }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
