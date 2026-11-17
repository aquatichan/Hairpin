"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { Button, buttonClass } from "./ui/button";
import { GoogleIcon } from "./ui/icons";

export function SignIn() {
  const { status, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "signed-in") router.replace("/discover");
  }, [status, router]);

  async function onClick() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      setError("Sign-in didn't complete. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {status === "unconfigured" ? (
        <>
          <Link href="/discover" className={buttonClass("secondary")}>
            Browse the hair library
          </Link>
          <p className="text-caption text-stone">Preview build: Google sign-in isn&apos;t connected yet.</p>
        </>
      ) : (
        <Button variant="secondary" onClick={onClick} disabled={busy || status === "loading"}>
          <GoogleIcon />
          Continue with Google
        </Button>
      )}
      {error && <p role="alert" className="text-caption text-ivory">{error}</p>}
    </div>
  );
}
