"use client";

import { Logo } from "./ui/logo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-provider";
import { Bloom } from "./fx/bloom";
import { Grainient } from "./fx/grainient";
import { LegacyDataPrompt } from "./legacy-data-prompt";
import { Avatar } from "./ui/avatar";
import { useProfile } from "@/lib/profile";
import { RenderStatus } from "./render-status";
import { PublikGate } from "./publik-gate";
import { testAuthEnabled } from "@/lib/test-auth";
import { DecodeIcon, DiscoverIcon, SavedIcon, TryIcon, YouIcon } from "./ui/icons";
import { HairpinLoader } from "./ui/hairpin-loader";

const tabs = [
  { href: "/discover", label: "Discover", Icon: DiscoverIcon },
  { href: "/decode", label: "Decode", Icon: DecodeIcon },
  { href: "/try", label: "Try", Icon: TryIcon },
  { href: "/saved", label: "Saved", Icon: SavedIcon },
  { href: "/you", label: "You", Icon: YouIcon },
];

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-light";

function SidebarProfile() {
  const { user } = useAuth();
  const profile = useProfile();
  const hair = [profile?.hairType ? `Type ${profile.hairType.toUpperCase()}` : profile?.texture, profile?.length].filter(Boolean).join(" · ");
  return (
    <Link href="/you" className={`surface flex items-center gap-3 rounded-card p-3 transition-colors hover:border-champagne/40 ${focusRing}`}>
      <Avatar name={user?.name} photoUrl={user?.photoUrl} className="size-11" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body font-medium">{user?.name?.split(" ")[0] ?? "Your profile"}</span>
        <span className="truncate text-caption text-stone">{hair || "Tell us about your hair"}</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "signed-out") router.replace("/");
  }, [status, router]);

  // While sign-in state resolves, the shell stays mounted but hidden, so the page is always rendered.
  const gated = status === "loading" || status === "signed-out";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const shell = (
    <div className={`flex flex-1 flex-col lg:flex-row ${gated ? "invisible" : "animate-fade"}`} aria-hidden={gated || undefined}>
      <a
        href="#app-main"
        className="fixed top-3 left-3 z-50 -translate-y-24 rounded-full bg-ivory px-4 py-2 text-body font-medium text-onyx focus:translate-y-0"
      >
        Skip to content
      </a>

      {/* Phones: a slim top bar carries the brand, since the sidebar is hidden. */}
      <header className="sticky top-0 z-20 flex items-center border-b border-hairline bg-onyx/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
        <Link href="/discover" aria-label="Hairpin, Discover" className={`flex h-14 items-center rounded-card ${focusRing}`}>
          <Logo />
        </Link>
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-onyx/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-hidden lg:border-t-0 lg:border-r lg:bg-onyx lg:px-4 lg:py-8 lg:backdrop-blur-none"
      >
        <Link href="/discover" aria-label="Hairpin, Discover" className={`relative z-10 mb-10 hidden rounded-card px-3 lg:block ${focusRing}`}>
          <Logo />
        </Link>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 hidden h-72 lg:block">
          <Grainient tone="mist" className="backdrop-fade" />
        </div>
        <Bloom name="peony-bl" className="absolute bottom-32 -left-24 hidden w-64 opacity-60 lg:block" rotate={10} />
        <ul className="relative flex justify-around lg:flex-col lg:justify-start lg:gap-1">
          {tabs.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <li key={href} className="flex-1 lg:flex-none">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex h-16 flex-col items-center justify-center gap-1 text-caption font-medium transition-colors duration-200 ease-out lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-full lg:px-4 lg:text-body ${focusRing} ${
                    active ? "text-ivory lg:bg-graphite" : "text-stone hover:text-ivory lg:hover:bg-graphite/60"
                  }`}
                >
                  {/* Active marker: a short bar above the tab on phones, a dot beside the label on desktop. */}
                  <span
                    aria-hidden
                    className={`absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-champagne transition-opacity duration-200 lg:top-1/2 lg:left-auto lg:right-4 lg:size-1.5 lg:translate-x-0 lg:-translate-y-1/2 ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <span data-nav={href} className={`inline-grid ${active ? "text-champagne" : ""}`}>
                    <Icon />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="relative mt-auto hidden flex-col gap-4 lg:flex">
          <SidebarProfile />
          {status === "unconfigured" && <p className="px-3 font-mono text-caption text-stone">Preview build</p>}
          <p className="flex gap-4 px-3 text-caption text-stone">
            <Link href="/privacy" className={`rounded-sm hover:text-ivory ${focusRing}`}>
              Privacy
            </Link>
            <Link href="/terms" className={`rounded-sm hover:text-ivory ${focusRing}`}>
              Terms
            </Link>
          </p>
        </div>
      </nav>

      <main id="app-main" tabIndex={-1} className="min-w-0 flex-1 pb-nav outline-none lg:pb-0">
        {status === "unconfigured" && (
          <p className="border-b border-hairline px-4 py-2 text-caption text-stone lg:px-8">
            Preview build. Sign-in and AI try-on are not connected yet.
          </p>
        )}
        <LegacyDataPrompt />
        {children}
      </main>
      <RenderStatus />
    </div>
  );

  // Google sign-in first, then Sign in with publik, then the app.
  // Test accounts (development only) have no publik install, so they skip that gate.
  if (status === "signed-in") return testAuthEnabled ? shell : <PublikGate>{shell}</PublikGate>;
  return (
    <>
      {shell}
      {gated && <HairpinLoader variant="screen" label={status === "loading" ? "Signing you in" : "Taking you to sign in"} />}
    </>
  );
}
