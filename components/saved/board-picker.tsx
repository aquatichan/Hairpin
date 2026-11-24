"use client";

import { useId, useState } from "react";
import { updateLibrary, useLibrary } from "@/lib/library";
import { LIBRARY_LIMITS, createBoard, setInBoard, type LibraryError } from "@/lib/library-model";
import { newId } from "@/lib/local-store";

export const LIBRARY_MESSAGES: Record<LibraryError["error"], string> = {
  name_required: "Give the board a name.",
  duplicate_name: "You already have a board with that name.",
  too_many_boards: `You can have up to ${LIBRARY_LIMITS.boards} boards.`,
  board_full: `A board holds up to ${LIBRARY_LIMITS.perBoard} looks.`,
  unknown_board: "That board no longer exists.",
};

/** Lowercase slug-style ID, valid for lib/library-model.ts. */
export const newBoardId = () => newId().toLowerCase();

/** Which boards one look is in: a checklist, plus a field to start a new board with it. */
export function BoardPicker({ lookId, lookName }: { lookId: string; lookName: string }) {
  const lib = useLibrary();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  if (!lib) return <p className="text-caption text-stone">Loading your boards…</p>;

  function create(e: React.FormEvent) {
    e.preventDefault();
    const failed = updateLibrary((l, now) => createBoard(l, name, newBoardId(), now, lookId));
    setError(failed ? LIBRARY_MESSAGES[failed.error] : null);
    if (!failed) setName("");
  }

  return (
    <div className="flex flex-col gap-3">
      {lib.boards.length > 0 ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">Boards for {lookName}</legend>
          {lib.boards.map((b) => {
            const checked = b.lookIds.includes(lookId);
            return (
              <label key={b.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-card px-2 hover:bg-slate has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-champagne-light">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const failed = updateLibrary((l, now) => setInBoard(l, b.id, lookId, e.target.checked, now));
                    setError(failed ? LIBRARY_MESSAGES[failed.error] : null);
                  }}
                  className="size-4 shrink-0 accent-champagne"
                />
                <span className="min-w-0 flex-1 truncate text-body">{b.name}</span>
                <span className="text-caption text-stone">{b.lookIds.length}</span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        <p className="text-caption text-stone">No boards yet. Start one with this look.</p>
      )}
      <form onSubmit={create} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          New board name
        </label>
        <input
          id={inputId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIBRARY_LIMITS.name}
          placeholder="New board, e.g. Next cut"
          className="h-11 min-w-0 flex-1 rounded-full border border-hairline bg-slate px-4 text-body placeholder:text-stone focus-visible:outline-2 focus-visible:outline-champagne-light"
        />
        <button type="submit" className="h-11 shrink-0 rounded-full border border-hairline px-4 text-body font-medium hover:border-stone/50 hover:bg-graphite focus-visible:outline-2 focus-visible:outline-champagne-light">
          Create
        </button>
      </form>
      {error && (
        <p role="alert" className="text-caption text-ivory">
          {error}
        </p>
      )}
    </div>
  );
}
