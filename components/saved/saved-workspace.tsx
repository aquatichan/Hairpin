"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { updateLibrary, useLibrary, useSyncState, type SyncState } from "@/lib/library";
import { boardsWith, deleteBoard, LIBRARY_LIMITS, renameBoard, createBoard, setInBoard, setSaved, type Board, type Library } from "@/lib/library-model";
import { localStore, type StoredBrief, type StoredRender } from "@/lib/local-store";
import { resolveCommunity, useCommunity } from "@/lib/community";
import { lookById, useMyLooks } from "@/lib/cuts";
import { libraryLooks, type Look } from "@/lib/looks";
import { Bloom } from "../fx/bloom";
import { Dither } from "../fx/dither";
import { PixelSurface } from "../fx/pixel-surface";
import { BlobImage } from "../ui/blob-image";
import { BottomSheet } from "../ui/bottom-sheet";
import { Button, buttonClass } from "../ui/button";
import { CloseIcon } from "../ui/icons";
import { Page, type Backdrop } from "../ui/page";
import { PageHeader } from "../ui/page-header";
import { BoardCover } from "./board-cover";
import { BoardPicker, LIBRARY_MESSAGES, newBoardId } from "./board-picker";

type Tab = "looks" | "boards" | "tryons" | "briefs";
const TABS: { id: Tab; label: string }[] = [
  { id: "looks", label: "Looks" },
  { id: "boards", label: "Boards" },
  { id: "tryons", label: "Try-ons" },
  { id: "briefs", label: "Briefs" },
];
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.id === v);

const looksFor = (ids: string[]) => ids.map((id) => lookById(id)).filter((l): l is Look => Boolean(l));
/** Saved IDs this device can't show: a community post that was removed, or a private cut kept on another device. */
const missingIn = (ids: string[]) => ids.filter((id) => !lookById(id));

function UnavailableTile({ id, onRemove, label }: { id: string; onRemove: () => void; label: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-3">
      <div className="surface flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-card border-dashed p-4 text-center">
        <p className="font-serif text-lead">No longer available</p>
        <p className="text-caption text-stone">{id.startsWith("m-") ? "A private cut kept on another device." : "This look was removed."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={quietBtn} onClick={onRemove}>
          {label}
        </button>
      </div>
    </li>
  );
}
const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-light";
const smallBtn = `inline-flex h-9 items-center justify-center rounded-full border border-hairline px-3 text-caption font-medium text-ivory transition-colors hover:border-stone/50 hover:bg-graphite ${focusRing}`;
const quietBtn = `inline-flex h-9 items-center justify-center rounded-full px-3 text-caption text-stone transition-colors hover:text-ivory ${focusRing}`;

/* ---------- private on-device data ---------- */

type Private = { status: "loading" } | { status: "error" } | { status: "ready"; renders: StoredRender[]; briefs: StoredBrief[] };

function usePrivate(): [Private, () => void] {
  const [state, setState] = useState<Private>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () =>
      Promise.all([localStore.list("renders"), localStore.list("briefs")]).then(
        ([renders, briefs]) => live && setState({ status: "ready", renders, briefs }),
        () => live && setState({ status: "error" }),
      );
    load();
    const off = localStore.subscribe(load);
    return () => {
      live = false;
      off();
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return [state, retry];
}

/* ---------- page ---------- */

export function SavedWorkspace() {
  // Re-render when this account's own cuts load, so saved private cuts resolve instead of showing as unavailable.
  useMyLooks();
  useCommunity();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const lib = useLibrary();
  const sync = useSyncState();
  const [priv, retry] = usePrivate();
  const [creating, setCreating] = useState(false);

  // Saved community cuts that aren't on a loaded feed page are fetched by id, so they resolve instead of looking removed.
  useEffect(() => {
    if (!lib) return;
    const ids = [...lib.saved.map((s) => s.lookId), ...lib.boards.flatMap((b) => b.lookIds)].filter((id) => id.startsWith("p-"));
    if (ids.length) void resolveCommunity([...new Set(ids)]);
  }, [lib]);

  const boardId = params.get("board");
  const tabParam = params.get("tab");
  const tab: Tab = boardId ? "boards" : isTab(tabParam) ? tabParam : "looks";

  const go = useCallback(
    (next: { tab?: Tab; board?: string | null }) => {
      const q = new URLSearchParams();
      const t = next.tab ?? tab;
      if (t !== "looks") q.set("tab", t);
      if (next.board) q.set("board", next.board);
      router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
    },
    [pathname, router, tab],
  );

  const counts: Record<Tab, number | null> = {
    looks: lib ? lib.saved.length : null,
    boards: lib ? lib.boards.length : null,
    tryons: priv.status === "ready" ? priv.renders.length : null,
    briefs: priv.status === "ready" ? priv.briefs.length : null,
  };

  return (
    <Page backdrop={SAVED_BACKDROP}>
      <PageHeader
        eyebrow="Your collection"
        title={
          <>
            Saved, <em className="accent-word">your way</em>
          </>
        }
        description="Looks you love, boards to plan your next cut, and your private try-ons and briefs."
        actions={tab === "boards" && !boardId ? <Button onClick={() => setCreating(true)}>New board</Button> : undefined}
      />
      <SyncLine state={sync} />

      <Tabs tab={tab} counts={counts} onChange={(t) => go({ tab: t, board: null })} />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={-1} className="outline-none">
        {tab === "looks" && (lib ? <LooksPanel lib={lib} /> : <GridSkeleton />)}
        {tab === "boards" &&
          (!lib ? (
            <GridSkeleton />
          ) : boardId ? (
            <BoardDetail lib={lib} id={boardId} onBack={() => go({ tab: "boards", board: null })} />
          ) : (
            <BoardsPanel lib={lib} onOpen={(id) => go({ tab: "boards", board: id })} onCreate={() => setCreating(true)} />
          ))}
        {tab === "tryons" && <PrivatePanel state={priv} retry={retry} render={(p) => <TryonsPanel renders={p.renders} />} />}
        {tab === "briefs" && <PrivatePanel state={priv} retry={retry} render={(p) => <BriefsPanel briefs={p.briefs} />} />}
      </div>

      <BoardNameSheet
        open={creating}
        title="New board"
        submit="Create board"
        initial=""
        onClose={() => setCreating(false)}
        onSubmit={(name) => {
          const id = newBoardId();
          const failed = updateLibrary((l, now) => createBoard(l, name, id, now));
          if (!failed) go({ tab: "boards", board: id });
          return failed ? LIBRARY_MESSAGES[failed.error] : null;
        }}
      />
    </Page>
  );
}

const SAVED_BACKDROP: Backdrop = {
  tone: "gold",
  dither: false,
  blooms: [
    { name: "peony-br", className: "-top-8 -right-16 w-[24rem] opacity-60", rotate: 200, flip: true },
  ],
};

function SyncLine({ state }: { state: SyncState }) {
  const text: Record<SyncState, string> = {
    local: "Saved on this device.",
    syncing: "Syncing your looks and boards…",
    synced: "Looks and boards are saved to your account.",
    offline: "Saved on this device. Syncing to your account when you're back online.",
    unavailable: "Saved on this device. Account sync isn't available right now.",
  };
  return (
    <p className="-mt-3 flex items-center gap-2 text-caption text-stone" role="status">
      <span aria-hidden className={`size-1.5 rounded-full ${state === "synced" ? "bg-champagne" : state === "syncing" ? "animate-pulse bg-stone" : "bg-hairline"}`} />
      {text[state]} Try-ons and briefs stay private on this device.
    </p>
  );
}

function Tabs({ tab, counts, onChange }: { tab: Tab; counts: Record<Tab, number | null>; onChange: (t: Tab) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKey(e: React.KeyboardEvent, i: number) {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length].id;
    onChange(t);
    refs.current[t]?.focus();
  }
  return (
    <div role="tablist" aria-label="Saved sections" className="-mx-4 flex gap-1 overflow-x-auto border-b border-hairline px-4 lg:mx-0 lg:px-0">
      {TABS.map((t, i) => {
        const selected = t.id === tab;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`relative flex h-12 shrink-0 items-center gap-2 px-3 text-body font-medium transition-colors ${focusRing} ${selected ? "text-ivory" : "text-stone hover:text-ivory"}`}
          >
            {t.label}
            {counts[t.id] !== null && (
              <span className={`rounded-full px-2 py-0.5 text-caption ${selected ? "bg-champagne text-onyx" : "bg-graphite text-stone"}`}>{counts[t.id]}</span>
            )}
            <span aria-hidden className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-champagne transition-opacity ${selected ? "opacity-100" : "opacity-0"}`} />
          </button>
        );
      })}
    </div>
  );
}

/* ---------- looks ---------- */

function LooksPanel({ lib }: { lib: Library }) {
  const looks = looksFor(lib.saved.map((s) => s.lookId));
  const missing = missingIn(lib.saved.map((s) => s.lookId));
  const [boardsFor, setBoardsFor] = useState<Look | null>(null);
  if (!looks.length && !missing.length) {
    return (
      <Empty title="No saved looks yet" body="Tap the bookmark on any look in Discover to keep it here.">
        <Link href="/discover" className={buttonClass("primary")}>
          Browse looks
        </Link>
      </Empty>
    );
  }
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-6 xl:grid-cols-4 2xl:grid-cols-5">
        {looks.map((l) => {
          const inBoards = boardsWith(lib, l.id).length;
          return (
            <LookTile key={l.id} look={l} note={inBoards ? `In ${inBoards} board${inBoards === 1 ? "" : "s"}` : null}>
              <button type="button" className={smallBtn} onClick={() => setBoardsFor(l)} aria-label={`Boards for ${l.name}`}>
                Boards
              </button>
              <button type="button" className={quietBtn} onClick={() => updateLibrary((x, now) => setSaved(x, l.id, false, now))} aria-label={`Remove ${l.name} from saved`}>
                Remove
              </button>
            </LookTile>
          );
        })}
        {missing.map((id) => (
          <UnavailableTile key={id} id={id} label="Remove" onRemove={() => updateLibrary((x, now) => setSaved(x, id, false, now))} />
        ))}
      </ul>
      <BottomSheet open={boardsFor !== null} onClose={() => setBoardsFor(null)} label="Boards" labelledBy="boards-for-title">
        {boardsFor && (
          <div className="flex flex-col gap-4">
            <SheetHeader id="boards-for-title" title={`Boards for ${boardsFor.name}`} onClose={() => setBoardsFor(null)} />
            <BoardPicker lookId={boardsFor.id} lookName={boardsFor.name} />
          </div>
        )}
      </BottomSheet>
    </>
  );
}

function LookTile({ look, note, children }: { look: Look; note?: string | null; children: React.ReactNode }) {
  const tryHref = `/try?look=${encodeURIComponent(look.id)}`;
  return (
    <li className="flex min-w-0 flex-col gap-3">
      <Link href={`/discover?look=${encodeURIComponent(look.id)}`} aria-label={`Open ${look.name} in Discover`} className={`group relative block aspect-[3/4] overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-champagne/40 ${focusRing}`}>
        <Image src={look.image} alt={look.alt ?? look.name} fill sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 45vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
        <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-linear-to-t/oklch from-onyx/90 to-transparent p-3 pt-10">
          <span className="font-serif text-title leading-tight">{look.name}</span>
          <span className="text-caption tracking-widest text-champagne uppercase">
            {look.length} · {look.texture}
          </span>
        </span>
      </Link>
      {note && <p className="-mt-1 text-caption text-stone">{note}</p>}
      <div className="flex flex-wrap items-center gap-1">
        <Link href={tryHref} className={smallBtn}>
          Try
        </Link>
        {children}
      </div>
    </li>
  );
}

/* ---------- boards ---------- */

function BoardsPanel({ lib, onOpen, onCreate }: { lib: Library; onOpen: (id: string) => void; onCreate: () => void }) {
  if (!lib.boards.length) {
    return (
      <Empty title="Plan your next cut with boards" body="Group the looks you're weighing up: for your next cut, a special occasion, or to show your barber.">
        <Button onClick={onCreate}>Create a board</Button>
      </Empty>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-6 xl:grid-cols-4 2xl:grid-cols-5">
      {lib.boards.map((b, i) => (
        <li key={b.id} className="stagger-in" style={{ "--i": Math.min(i, 10) } as React.CSSProperties}>
          <button type="button" onClick={() => onOpen(b.id)} className={`group flex w-full flex-col gap-3 text-left ${focusRing} rounded-card`}>
            <PixelSurface as="span" className="press block aspect-square overflow-hidden rounded-card border border-hairline bg-graphite transition-colors group-hover:border-champagne/40" gap={14}>
              <BoardCover looks={looksFor(b.lookIds)} />
            </PixelSurface>
            <span className="flex flex-col gap-0.5">
              <span className="truncate font-serif text-title">{b.name}</span>
              <span className="text-caption text-stone">
                {b.lookIds.length} look{b.lookIds.length === 1 ? "" : "s"}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BoardDetail({ lib, id, onBack }: { lib: Library; id: string; onBack: () => void }) {
  const board = lib.boards.find((b) => b.id === id);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [id]);

  if (!board) {
    return (
      <Empty title="Board not found" body="It may have been deleted on another device.">
        <Button variant="ghost" onClick={onBack}>
          All boards
        </Button>
      </Empty>
    );
  }
  const looks = looksFor(board.lookIds);
  const missing = missingIn(board.lookIds);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onBack} className={`${quietBtn} -ml-3 self-start`}>
            ← All boards
          </button>
          <h2 ref={heading} tabIndex={-1} className="font-serif text-headline outline-none">
            {board.name}
          </h2>
          <p className="text-caption text-stone">
            {board.lookIds.length} look{board.lookIds.length === 1 ? "" : "s"}
          </p>
        </div>
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm delete">
            <span className="text-body text-stone">Delete “{board.name}”? Its looks stay saved.</span>
            <Button
              onClick={() => {
                updateLibrary((l, now) => deleteBoard(l, board.id, now));
                onBack();
              }}
            >
              Delete board
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAdding(true)}>Add looks</Button>
            <Button variant="ghost" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>
        )}
      </div>

      {looks.length || missing.length ? (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-6 xl:grid-cols-4 2xl:grid-cols-5">
          {missing.map((id) => (
            <UnavailableTile key={id} id={id} label="Remove from board" onRemove={() => updateLibrary((x, now) => setInBoard(x, board.id, id, false, now))} />
          ))}
          {looks.map((l) => (
            <LookTile key={l.id} look={l}>
              <button type="button" className={quietBtn} onClick={() => updateLibrary((x, now) => setInBoard(x, board.id, l.id, false, now))} aria-label={`Remove ${l.name} from ${board.name}`}>
                Remove from board
              </button>
            </LookTile>
          ))}
        </ul>
      ) : (
        <Empty title="This board is empty" body="Add looks from the library, or use Boards on any saved look.">
          <Button onClick={() => setAdding(true)}>Add looks</Button>
        </Empty>
      )}

      <BoardNameSheet
        open={renaming}
        title="Rename board"
        submit="Save name"
        initial={board.name}
        onClose={() => setRenaming(false)}
        onSubmit={(name) => {
          const failed = updateLibrary((l, now) => renameBoard(l, board.id, name, now));
          return failed ? LIBRARY_MESSAGES[failed.error] : null;
        }}
      />
      <AddLooksSheet open={adding} board={board} onClose={() => setAdding(false)} />
    </div>
  );
}

function BoardNameSheet({ open, title, submit, initial, onClose, onSubmit }: { open: boolean; title: string; submit: string; initial: string; onClose: () => void; onSubmit: (name: string) => string | null }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const titleId = useId();
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setName(initial);
        setError(null);
      });
    }
  }, [open, initial]);
  return (
    <BottomSheet open={open} onClose={onClose} label={title} labelledBy={titleId}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const failed = onSubmit(name);
          setError(failed);
          if (!failed) onClose();
        }}
      >
        <SheetHeader id={titleId} title={title} onClose={onClose} />
        <label htmlFor={inputId} className="text-body text-stone">
          Board name
        </label>
        <input
          id={inputId}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIBRARY_LIMITS.name}
          placeholder="e.g. Next cut"
          className={`h-12 rounded-card border border-hairline bg-slate px-4 text-body placeholder:text-stone ${focusRing}`}
        />
        {error && (
          <p role="alert" className="text-caption text-ivory">
            {error}
          </p>
        )}
        <Button type="submit">{submit}</Button>
      </form>
    </BottomSheet>
  );
}

function AddLooksSheet({ open, board, onClose }: { open: boolean; board: Board; onClose: () => void }) {
  const titleId = useId();
  const mine = useMyLooks();
  const [error, setError] = useState<string | null>(null);
  return (
    <BottomSheet open={open} onClose={onClose} label="Add looks" labelledBy={titleId} size="wide">
      <div className="flex flex-col gap-4">
        <SheetHeader id={titleId} title={`Add looks to ${board.name}`} onClose={onClose} />
        <p className="-mt-2 text-caption text-stone">Tap to add or remove. Added looks are saved too.</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[...mine, ...libraryLooks].map((l) => {
            const inBoard = board.lookIds.includes(l.id);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  aria-pressed={inBoard}
                  onClick={() => {
                    const failed = updateLibrary((x, now) => setInBoard(x, board.id, l.id, !inBoard, now));
                    setError(failed ? LIBRARY_MESSAGES[failed.error] : null);
                  }}
                  className={`group flex w-full flex-col gap-2 rounded-card text-left ${focusRing}`}
                >
                  <span className={`relative block aspect-[3/4] overflow-hidden rounded-card border bg-graphite ${inBoard ? "border-champagne" : "border-hairline group-hover:border-stone/50"}`}>
                    <Image src={l.image} alt="" fill sizes="(max-width: 640px) 45vw, 200px" className="object-cover" />
                    {inBoard && <span className="absolute top-2 left-2 rounded-full bg-champagne px-2 py-0.5 text-caption font-medium text-onyx">Added</span>}
                  </span>
                  <span className="text-body font-medium">{l.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="text-caption text-ivory">
            {error}
          </p>
        )}
        <Button onClick={onClose}>Done</Button>
      </div>
    </BottomSheet>
  );
}

/* ---------- private: try-ons and briefs ---------- */

function PrivatePanel({ state, retry, render }: { state: Private; retry: () => void; render: (p: Extract<Private, { status: "ready" }>) => React.ReactNode }) {
  if (state.status === "loading") return <GridSkeleton tall />;
  if (state.status === "error") {
    return (
      <Empty title="Couldn't open your saved items" body="Your browser's storage didn't respond. Private browsing or full storage can cause this.">
        <Button variant="ghost" onClick={retry}>
          Try again
        </Button>
      </Empty>
    );
  }
  return <>{render(state)}</>;
}

function provenance(r: StoredRender) {
  if (r.mock) return "Demo, not an AI render";
  switch (r.mode) {
    case "catalog-reference":
      return r.experimental ? "Reference match · experimental" : "Reference match";
    case "catalog-describe":
      return "From the written description";
    case "upload":
      return "From your screenshot";
    case "text":
      return "From your description";
    default:
      return "Try-on";
  }
}

function TryonsPanel({ renders }: { renders: StoredRender[] }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!renders.length) {
    return (
      <Empty title="No try-ons yet" body="Try a look on your own photo. Results are kept privately on this device.">
        <Link href="/try" className={buttonClass("primary")}>
          Open the studio
        </Link>
      </Empty>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-6 xl:grid-cols-4 2xl:grid-cols-5">
      {renders.map((r) => {
        const look = r.lookId ? lookById(r.lookId) : undefined;
        return (
          <li key={r.id} className="flex min-w-0 flex-col gap-3">
            <div className="relative">
              <BlobImage blob={r.result} alt={`Try-on: ${r.lookName}${r.mock ? " (demo, not an AI render)" : ""}`} className="aspect-[4/5]" />
              {look && (
                <span className="absolute right-2 bottom-2 block aspect-[3/4] w-[28%] overflow-hidden rounded-card border border-champagne/60 shadow-lg shadow-onyx" title={`Reference: ${look.name}`}>
                  <Image src={look.image} alt={`Reference: ${look.name}`} fill sizes="80px" className="object-cover" />
                </span>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="truncate text-body font-medium">
                {r.lookName}
                {r.tweak ? ` · ${r.tweak}` : ""}
              </p>
              <p className="text-caption text-stone">
                {provenance(r)} · {dateFmt.format(r.createdAt)}
              </p>
            </div>
            {confirm === r.id ? (
              <div className="flex flex-wrap gap-1" role="group" aria-label={`Delete ${r.lookName}?`}>
                <button type="button" className={smallBtn} onClick={() => localStore.remove("renders", r.id)}>
                  Delete
                </button>
                <button type="button" className={quietBtn} onClick={() => setConfirm(null)}>
                  Keep
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                <Link href={`/brief?render=${r.id}`} className={smallBtn}>
                  Brief
                </Link>
                {look && (
                  <Link href={`/try?look=${encodeURIComponent(look.id)}`} className={smallBtn}>
                    Try again
                  </Link>
                )}
                <button type="button" className={quietBtn} onClick={() => setConfirm(r.id)} aria-label={`Delete try-on ${r.lookName}`}>
                  Delete
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BriefsPanel({ briefs }: { briefs: StoredBrief[] }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!briefs.length) {
    return (
      <Empty title="No Barber Briefs yet" body="Turn a try-on into clear instructions to show your barber.">
        <Link href="/try" className={buttonClass("primary")}>
          Start with a try-on
        </Link>
      </Empty>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-6 xl:grid-cols-4 2xl:grid-cols-5">
      {briefs.map((b) => (
        <li key={b.id} className="flex min-w-0 flex-col gap-3">
          <Link href={`/brief?id=${b.id}`} className={`flex aspect-[4/5] flex-col justify-between rounded-card bg-ivory p-4 text-onyx transition-transform hover:-translate-y-0.5 ${focusRing}`}>
            <span className="text-caption font-semibold tracking-widest text-onyx/60 uppercase">Barber Brief</span>
            <span className="flex flex-col gap-1">
              <span className="font-serif text-title">{b.brief.styleName}</span>
              <span className="text-caption text-onyx/60">
                {dateFmt.format(b.createdAt)}
                {b.mock ? " · Demo" : ""}
              </span>
            </span>
          </Link>
          {confirm === b.id ? (
            <div className="flex flex-wrap gap-1" role="group" aria-label={`Delete ${b.brief.styleName}?`}>
              <button type="button" className={smallBtn} onClick={() => localStore.remove("briefs", b.id)}>
                Delete
              </button>
              <button type="button" className={quietBtn} onClick={() => setConfirm(null)}>
                Keep
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              <Link href={`/brief?id=${b.id}`} className={smallBtn}>
                Open
              </Link>
              <button type="button" className={quietBtn} onClick={() => setConfirm(b.id)} aria-label={`Delete brief ${b.brief.styleName}`}>
                Delete
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ---------- shared bits ---------- */

function SheetHeader({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 id={id} className="font-serif text-title">
        {title}
      </h2>
      <button type="button" onClick={onClose} aria-label="Close" className={`grid size-10 shrink-0 place-items-center rounded-full border border-hairline hover:bg-slate ${focusRing}`}>
        <CloseIcon />
      </button>
    </div>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="surface relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-card border-dashed px-6 py-20 text-center">
      <Dither className="-z-10 opacity-[0.12]" cell={6} />
      <Bloom name="bloom-4" className="absolute -right-6 -bottom-8 -z-10 w-44 opacity-60" rotate={25} />
      <svg viewBox="0 0 48 48" className="size-12 text-champagne" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <path d="M14 8h20v32l-10-7-10 7z" />
        <path d="M24 16c-2 2.5-2 5 0 7.5 2-2.5 2-5 0-7.5zM20 20c3 .5 4 2.5 4 3.5-3-.5-4-2-4-3.5zM28 20c-3 .5-4 2.5-4 3.5 3-.5 4-2 4-3.5z" />
      </svg>
      <h2 className="font-serif text-title">{title}</h2>
      <p className="max-w-sm text-body text-stone">{body}</p>
      {children}
    </div>
  );
}

function GridSkeleton({ tall = false }: { tall?: boolean }) {
  const items = useMemo(() => [0, 1, 2, 3], []);
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5 xl:grid-cols-4" aria-label="Loading">
      {items.map((i) => (
        <li key={i} className={`animate-pulse rounded-card bg-graphite ${tall ? "aspect-[4/5]" : "aspect-[3/4]"}`} style={{ animationDelay: `${i * 90}ms` }} />
      ))}
    </ul>
  );
}
