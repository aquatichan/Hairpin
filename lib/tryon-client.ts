import { apiFetch } from "./api-client";
import { getAccountScope } from "./account-scope";
import { setFreeRemaining } from "./free-status";
import { localStore, newId, type StoredRender } from "./local-store";
import type { TryonTarget } from "./tryon-plan";

/** What the studio asks for. The server resolves catalog portraits itself; only the person's own screenshot is uploaded. */
export type RenderRequest = {
  photo: Blob;
  target: TryonTarget;
  /** The person's own screenshot, for target.kind === "upload". */
  reference?: Blob | null;
  /** Shown on the result and the Barber Brief. */
  label: string;
  tweak: string | null;
  signal?: AbortSignal;
};

/** Requests one try-on render and keeps it on this device, in the requesting account's storage. */
export async function requestRender(input: RenderRequest): Promise<StoredRender> {
  const started = performance.now();
  // The account that asked owns the result. If someone else is signed in by the time it arrives, it is dropped.
  const scope = getAccountScope();
  if (!scope) throw new Error("Not signed in.");
  const form = new FormData();
  form.set("photo", input.photo, "photo.jpg");
  form.set("target", input.target.kind);
  if ("lookId" in input.target) form.set("lookId", input.target.lookId);
  if (input.target.kind === "upload") {
    if (!input.reference) throw new Error("An uploaded reference is missing.");
    form.set("reference", input.reference, "reference.jpg");
    if (input.target.name) form.set("referenceName", input.target.name);
  }
  if (input.target.kind === "text") form.set("description", input.target.description);
  if (input.tweak) form.set("tweak", input.tweak);

  const response = await apiFetch("/api/tryon", { method: "POST", body: form, signal: input.signal });
  const freeLeft = response.headers.get("x-hairpin-free-remaining");
  if (freeLeft !== null) setFreeRemaining(Number(freeLeft));
  const made: StoredRender = {
    id: newId(),
    lookId: "lookId" in input.target ? input.target.lookId : null,
    lookName: input.label,
    tweak: input.tweak,
    result: await response.blob(),
    mock: response.headers.get("x-hairpin-mock") === "1",
    mode: input.target.kind,
    experimental: response.headers.get("x-hairpin-experimental") === "1",
    latencyMs: Math.round(performance.now() - started),
    createdAt: Date.now(),
  };
  if (!(await localStore.putFor(scope, "renders", made))) throw new Error("Signed out before the try-on finished.");
  return made;
}
