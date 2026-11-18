"use client";

import { useCallback, useEffect, useState } from "react";
import { setChoice, useAiChoice } from "@/lib/ai-choice";
import { authHeader } from "@/lib/api-client";
import { Button, buttonClass } from "./ui/button";
import { Logo } from "./ui/logo";
import { Notice } from "./ui/notice";

/**
 * The second half of sign-in. After Google sign-in, the server has already
 * made this person's publik profile (an install tied to their Google
 * account). The first time, this sends them straight to publik to link it,
 * with no extra click; publik's "Back to Hairpin" returns them here. If they
 * come back without finishing, they get the Sign in with publik button.
 * Nothing in the app shows until publik says they are signed in.
 */

type Status =
  | { state: "checking" }
  | { state: "claimed"; hasPlan: boolean; topUpUrl: string | null }
  | { state: "sign_in"; claimUrl: string }
  | { state: "unreachable"; message: string }
  | { state: "not_connected"; message: string }
  | { state: "signed_out" };

const UNREACHABLE = "publik is not reachable. Check your connection.";
const POLL_MS = 3_000;
const POLL_LIMIT_MS = 10 * 60_000;
const REDIRECTED = "hairpin.publik-redirected";

async function fetchStatus(): Promise<Status> {
  try {
    const res = await fetch("/api/publik/status", { headers: await authHeader(), cache: "no-store" });
    const body = (await res.json()) as Status;
    return body && typeof body.state === "string" ? body : { state: "unreachable", message: UNREACHABLE };
  } catch {
    return { state: "unreachable", message: UNREACHABLE };
  }
}

/** publik sends the person back to this page once they have signed in. */
function withReturn(claimUrl: string) {
  const url = new URL(claimUrl);
  url.searchParams.set("return_to", window.location.href);
  return url.toString();
}

function session(action: "get" | "set" | "clear") {
  try {
    if (action === "get") return sessionStorage.getItem(REDIRECTED) === "1";
    if (action === "set") sessionStorage.setItem(REDIRECTED, "1");
    else sessionStorage.removeItem(REDIRECTED);
  } catch {}
  return false;
}

function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col bg-onyx">
      <header className="p-6 lg:px-12 lg:pt-12">
        <Logo />
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 animate-fade flex-col justify-center gap-6 px-4 pb-24">
        <h1 className="font-serif text-headline">{title}</h1>
        {children}
      </div>
    </main>
  );
}

function OwnKeyForm({ onBack }: { onBack: () => void }) {
  const [key, setKey] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (key.trim()) setChoice({ mode: "own", key: key.trim() });
      }}
    >
      <label className="flex flex-col gap-2 text-body text-stone">
        Your OpenAI API key
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-…"
          className="h-12 rounded-card border border-hairline bg-slate px-4 text-body text-ivory"
        />
      </label>
      <p className="text-caption text-stone">It stays on this device. Hairpin&apos;s server uses it for each request you make and never stores it.</p>
      <div className="flex gap-2">
        <button type="submit" className={`${buttonClass("primary")} flex-1`} disabled={!key.trim()}>
          Use this key
        </button>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}

export function PublikGate({ children }: { children: React.ReactNode }) {
  const choice = useAiChoice();
  const [status, setStatus] = useState<Status>({ state: "checking" });
  const [waitingUntil, setWaitingUntil] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [ownKey, setOwnKey] = useState(false);

  const refresh = useCallback(() => fetchStatus().then(setStatus), []);

  useEffect(() => {
    let live = true;
    fetchStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);

  // First time this tab meets the publik step: go straight to publik instead of showing a button.
  const redirecting = status.state === "sign_in" && !session("get");
  useEffect(() => {
    if (status.state === "sign_in" && !session("get")) {
      session("set");
      window.location.assign(withReturn(status.claimUrl));
    }
    if (status.state === "claimed") session("clear");
  }, [status]);

  // After "Sign in with publik" (opened in a new tab), check every 3 seconds for at most 10 minutes.
  useEffect(() => {
    if (waitingUntil === null || status.state !== "sign_in") return;
    const timer = setInterval(() => {
      if (Date.now() > waitingUntil) {
        clearInterval(timer);
        setWaitingUntil(null);
        setTimedOut(true);
        return;
      }
      refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waitingUntil, status.state, refresh]);

  // Coming back from publik's tab (signed in, or after getting a plan): check again.
  useEffect(() => {
    if (status.state === "checking") return;
    const onFocus = () => {
      if (document.visibilityState === "visible" && status.state !== "claimed") refresh();
      if (status.state === "claimed" && !status.hasPlan) refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [status, refresh]);

  if (status.state === "signed_out") return <>{children}</>; // the app shell sends them back to Google sign-in

  if (status.state === "checking" || redirecting || choice === undefined) {
    return (
      <Screen title={redirecting ? "Taking you to publik…" : "Signing you in…"}>
        <div className="h-1 w-24 animate-pulse rounded-full bg-hairline" aria-hidden />
      </Screen>
    );
  }

  if (status.state === "unreachable" || status.state === "not_connected") {
    return (
      <Screen title="Sign in with publik">
        <Notice tone="error">{status.message}</Notice>
        <Button
          onClick={() => {
            setStatus({ state: "checking" });
            refresh();
          }}
        >
          Retry
        </Button>
      </Screen>
    );
  }

  if (status.state === "sign_in") {
    return (
      <Screen title="Sign in with publik">
        <p className="text-body text-stone">
          Hairpin uses your publik account for its AI. We set one up for your Google account; sign in on the publik page to finish, and this page continues on its own.
        </p>
        <a
          href={withReturn(status.claimUrl)}
          target="_blank"
          rel="noopener"
          className={buttonClass("primary")}
          onClick={() => {
            setTimedOut(false);
            setWaitingUntil(Date.now() + POLL_LIMIT_MS);
          }}
        >
          Sign in with publik
        </a>
        {waitingUntil !== null && <Notice>Waiting for you to sign in on the publik page.</Notice>}
        {timedOut && <Notice>No sign-in after 10 minutes. Click Sign in with publik to try again.</Notice>}
      </Screen>
    );
  }

  // Signed in with publik. Until the person picks how their AI runs, ask once.
  if (!choice) {
    return (
      <Screen title={ownKey ? "Use my own key" : "How should your AI run?"}>
        {ownKey ? (
          <OwnKeyForm onBack={() => setOwnKey(false)} />
        ) : (
          <>
            <p className="text-body text-stone">
              {status.hasPlan
                ? "Your publik plan can pay for try-ons, Decode and Barber Briefs."
                : "You don't have a publik plan yet. Get one, or use an OpenAI key of your own."}
            </p>
            {status.hasPlan ? (
              <Button onClick={() => setChoice({ mode: "publik" })}>Connect your plan</Button>
            ) : (
              status.topUpUrl && (
                <a href={status.topUpUrl} target="_blank" rel="noopener" className={buttonClass("primary")}>
                  Get a plan
                </a>
              )
            )}
            <Button variant="ghost" onClick={() => setOwnKey(true)}>
              Use my own key
            </Button>
          </>
        )}
      </Screen>
    );
  }

  return <>{children}</>;
}
