"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "../../../lib/supabase/client";

type Mode = "signin" | "signup";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/app/auth/callback?next=${encodeURIComponent(next)}`
        }
      });
      if (signUpError) {
        setError(signUpError.message);
        setBusy(false);
        return;
      }
      // With email confirmation on, there is no session yet — tell the user to check mail.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setNotice("Check your inbox to confirm your address, then sign in.");
        setMode("signin");
        setBusy(false);
        return;
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setBusy(false);
        return;
      }
    }

    router.replace(next);
    router.refresh();
  }

  async function signInWithGoogle() {
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/app/auth/callback?next=${encodeURIComponent(next)}`
      }
    });
    if (oauthError) setError(oauthError.message);
  }

  return (
    <div className="cg-auth">
      <h1 className="cg-title">{mode === "signin" ? "Sign in" : "Create account"}</h1>
      <p className="cg-subtitle">
        {mode === "signin"
          ? "Use your ChartsGPT web account to run the analysis engine."
          : "Your account keeps your analyses and usage in sync across devices."}
      </p>

      <form onSubmit={submit}>
        <label className="cg-field">
          <span>Email</span>
          <input
            className="cg-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="cg-field">
          <span>Password</span>
          <input
            className="cg-input"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button className="cg-button" type="submit" disabled={busy}>
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        className="cg-button cg-button-secondary"
        style={{ marginTop: 10 }}
        onClick={signInWithGoogle}
      >
        Continue with Google
      </button>

      {error ? <p className="cg-error">{error}</p> : null}
      {notice ? <p className="cg-note">{notice}</p> : null}

      <p className="cg-note">
        {mode === "signin" ? "No account yet? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--cg-accent)",
            font: "inherit",
            cursor: "pointer"
          }}
        >
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
