"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../auth-provider";
import { ArrowRight } from "./icons";

/**
 * Every landing CTA goes through the existing Google sign-in (AuthProvider),
 * then into the gated app. Signed-in people go straight to `href`.
 */
export function useStart() {
  const { status, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(href = "/discover") {
    setError(null);
    if (status === "signed-in" || status === "unconfigured") {
      router.push(href);
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle();
      router.push(href);
    } catch {
      setError("Sign-in didn't complete. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return { start, busy: busy || status === "loading", error, signedIn: status === "signed-in" };
}

export function StartButton({
  href = "/discover",
  label = "Get Started",
  variant = "solid",
  className = "",
}: {
  href?: string;
  label?: string;
  variant?: "solid" | "outline" | "link";
  className?: string;
}) {
  const { start, busy, error } = useStart();
  return (
    <span className={`hp-start ${className}`}>
      <button type="button" className={`hp-btn hp-btn--${variant}`} onClick={() => start(href)} disabled={busy} aria-busy={busy || undefined}>
        <span>{label}</span>
        <ArrowRight />
      </button>
      {error && (
        <span role="alert" className="hp-start__error">
          {error}
        </span>
      )}
    </span>
  );
}
