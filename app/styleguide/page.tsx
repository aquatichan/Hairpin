"use client";

import { useState } from "react";
import { BeforeAfter } from "@/components/ui/before-after";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";

const colors = ["onyx", "graphite", "slate", "hairline", "stone", "ivory", "champagne"] as const;
const swatch: Record<(typeof colors)[number], string> = {
  onyx: "bg-onyx", graphite: "bg-graphite", slate: "bg-slate", hairline: "bg-hairline", stone: "bg-stone", ivory: "bg-ivory", champagne: "bg-champagne",
};

const swatchImage = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="5"><rect width="4" height="5" fill="${color}"/></svg>`)}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-hairline pt-6">
      <h2 className="text-caption font-semibold tracking-widest text-stone uppercase">{title}</h2>
      {children}
    </section>
  );
}

export default function Styleguide() {
  const [chip, setChip] = useState("All");
  const [sheet, setSheet] = useState(false);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12">
      <h1 className="font-serif text-display">Styleguide</h1>
      <Section title="Color">
        <div className="grid grid-cols-4 gap-2 md:grid-cols-7">
          {colors.map((c) => (
            <div key={c} className="flex flex-col gap-2">
              <div className={`aspect-square rounded-card border border-hairline ${swatch[c]}`} />
              <span className="text-caption text-stone">{c}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Type">
        <p className="font-serif text-display">Display</p>
        <p className="font-serif text-headline">Headline</p>
        <p className="font-serif text-title">Title</p>
        <p className="text-lead">Lead 16</p>
        <p className="text-body">Body 14</p>
        <p className="text-caption text-stone">Caption 12</p>
      </Section>
      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>
      <Section title="Chips">
        <div className="flex gap-2">
          {["All", "Short", "Curly"].map((c) => (
            <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Notices">
        <Notice>Cutting… this can take a little while.</Notice>
        <Notice tone="error">That didn&apos;t work. Please try again.</Notice>
      </Section>
      <Section title="Before / after">
        <div className="max-w-xs">
          <BeforeAfter before={swatchImage("#222225")} after={swatchImage("#c9a96e")} label="Compare before and after" />
        </div>
      </Section>
      <Section title="Sheet, skeleton, empty state">
        <Button variant="ghost" onClick={() => setSheet(true)} className="self-start">
          Open sheet
        </Button>
        <BottomSheet open={sheet} onClose={() => setSheet(false)} label="Example sheet">
          <h2 className="font-serif text-title">Sheet title</h2>
          <p className="text-body text-stone">Sheets slide up on phones and center on desktop.</p>
          <Button onClick={() => setSheet(false)}>Done</Button>
        </BottomSheet>
        <Skeleton className="h-24" />
        <EmptyState title="Nothing saved yet" body="Your renders and Barber Briefs will live here." />
      </Section>
    </main>
  );
}
