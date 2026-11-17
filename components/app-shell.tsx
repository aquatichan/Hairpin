"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-provider";
import { DiscoverIcon, SavedIcon, TryIcon, YouIcon } from "./ui/icons";

const tabs = [
  { href: "/discover", label: "Discover", Icon: DiscoverIcon },
  { href: "/try", label: "Try", Icon: TryIcon },
  { href: "/saved", label: "Saved", Icon: SavedIcon },
  { href: "/you", label: "You", Icon: YouIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "signed-out") router.replace("/");
  }, [status, router]);

  if (status === "loading" || status === "signed-out") return <div className="flex-1 bg-onyx" />;

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-hairline bg-onyx px-4 pb-[env(safe-area-inset-bottom)] lg:sticky lg:top-0 lg:h-dvh lg:w-56 lg:shrink-0 lg:flex-col lg:justify-start lg:gap-2 lg:border-t-0 lg:border-r lg:p-6"
      >
        <Link href="/discover" className="hidden pb-6 font-serif text-title lg:block">
          Hairpin
        </Link>
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-16 flex-col items-center justify-center gap-1 px-4 text-caption font-medium transition-colors duration-200 ease-out lg:h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-full lg:text-body ${
                active ? "text-ivory lg:bg-graphite" : "text-stone hover:text-ivory"
              }`}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>
      <main className="min-w-0 flex-1 pb-24 lg:pb-0">
        {status === "unconfigured" && (
          <p className="border-b border-hairline px-4 py-2 text-caption text-stone lg:px-8">
            Preview build. Sign-in and AI try-on are not connected yet.
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
