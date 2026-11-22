"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon, HairpinMark, MenuIcon } from "./icons";
import { StartButton } from "./start-button";

const LINKS = [
  { href: "#discover", label: "Discover" },
  { href: "#try-on", label: "Try-On" },
  { href: "#features", label: "Boards" },
  { href: "/brief", label: "Barber Brief" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mobile menu: focus the first link on open, trap Tab, close on Escape, restore focus.
  useEffect(() => {
    if (!open) return;
    const root = panel.current;
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>("a, button") ?? []);
    focusables()[0]?.focus();
    const button = toggle.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key !== "Tab") return;
      const list = [button!, ...focusables()];
      const i = list.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i === list.length - 1 ? 0 : i + 1;
      e.preventDefault();
      list[next]?.focus();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      button?.focus();
    };
  }, [open]);

  return (
    <header className={`hp-nav ${scrolled ? "is-scrolled" : ""} ${open ? "is-open" : ""}`}>
      <div className="hp-nav__inner">
        <a href="#top" className="hp-wordmark" aria-label="Hairpin, back to top">
          <HairpinMark />
          Hairpin
        </a>
        <nav aria-label="Landing" className="hp-nav__links">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <StartButton variant="outline" className="hp-nav__cta" />
        <button
          ref={toggle}
          type="button"
          className="hp-nav__toggle"
          aria-expanded={open}
          aria-controls="hp-mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>
      <div id="hp-mobile-menu" ref={panel} className="hp-nav__sheet" hidden={!open}>
        <nav aria-label="Landing mobile">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
        </nav>
        <StartButton />
      </div>
    </header>
  );
}
