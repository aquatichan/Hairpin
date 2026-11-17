import { apiFetch } from "./api-client";
import { localStore, newId, type StoredRender } from "./local-store";

/** Requests one try-on render and saves it to the on-device store. */
export async function requestRender(input: {
  photo: Blob;
  reference: Blob | null;
  lookId: string | null;
  lookName: string;
  tweak: string | null;
}): Promise<StoredRender> {
  const started = performance.now();
  const form = new FormData();
  form.set("photo", input.photo, "photo.jpg");
  if (input.reference) form.set("reference", input.reference, "reference.jpg");
  else form.set("lookName", input.lookName);
  if (input.tweak) form.set("tweak", input.tweak);
  const response = await apiFetch("/api/tryon", { method: "POST", body: form });
  const made: StoredRender = {
    id: newId(),
    lookId: input.reference ? null : input.lookId,
    lookName: input.lookName,
    tweak: input.tweak,
    result: await response.blob(),
    mock: response.headers.get("x-hairpin-mock") === "1",
    latencyMs: Math.round(performance.now() - started),
    createdAt: Date.now(),
  };
  await localStore.put("renders", made);
  return made;
}
