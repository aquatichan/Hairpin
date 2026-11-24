import { errorResponse, publikFailure } from "@/lib/api-error";
import { editImage, editKind, type AiProvider } from "@/lib/ai";
import { isVendor } from "@/lib/ai-vendors";
import { freeStatus, reserveFree, type FreeTicket } from "@/lib/free-tryons.server";
import { publikMock } from "@/lib/publik";
import { requireMember, wantsFree } from "@/lib/publik-gate";
import { reserveAllowance, takeRenderTicket } from "@/lib/render-guard.server";
import { findLook, lookFacts, referenceImage } from "@/lib/tryon-catalog.server";
import { assertSendable, cleanText, LIMITS, planTryon, sniffImage, TWEAKS, type ProviderKind, type TryonTarget } from "@/lib/tryon-plan";

/**
 * POST /api/tryon (multipart). Images never touch disk or logs here; the render streams back and is kept only
 * on the person's device.
 *
 *   photo        the person's selfie (required; JPEG, PNG or WebP)
 *   target       catalog-reference | catalog-describe | upload | text
 *   lookId       catalog slug, for the catalog targets. The reference portrait is resolved here, never sent by the client.
 *   reference    the person's own screenshot, for target=upload
 *   referenceName optional label for an uploaded screenshot (e.g. the name Decode gave it)
 *   description  the person's own words, for target=text
 *   tweak        optional, one of TWEAKS
 *
 * Legacy requests without `target` still work as before: `reference` means upload, otherwise `lookName` is the
 * text description.
 */

const publikTrial = () => process.env.NEXT_PUBLIC_PUBLIK_REFERENCE_TRIAL === "1";

async function readImage(value: FormDataEntryValue | null, maxBytes: number, what: string): Promise<Blob | Response> {
  if (!(value instanceof File) || value.size === 0) return errorResponse(400, { code: "bad_request", message: `${what} is required.` });
  if (value.size > maxBytes) return errorResponse(413, { code: "too_large", message: `${what} is too large. Try a smaller image.` });
  const type = sniffImage(new Uint8Array(await value.slice(0, 16).arrayBuffer()));
  if (!type || !LIMITS.imageTypes.includes(type)) return errorResponse(415, { code: "bad_image", message: `${what} must be a JPEG, PNG or WebP image.` });
  return new Blob([value], { type });
}

async function parseTarget(form: FormData): Promise<TryonTarget | Response> {
  const raw = form.get("target");
  const target = typeof raw === "string" ? raw : null;
  const lookId = form.get("lookId");
  switch (target) {
    case "catalog-reference":
    case "catalog-describe":
      if (!(await findLook(lookId))) return errorResponse(404, { code: "unknown_look", message: "That look isn't in the library anymore. Pick another one." });
      return { kind: target, lookId: lookId as string };
    case "upload":
      return { kind: "upload", name: cleanText(form.get("referenceName"), LIMITS.nameMax) || null };
    case "text":
      return { kind: "text", description: cleanText(form.get("description"), LIMITS.descriptionMax) };
    case null:
      // Legacy shape.
      if (form.get("reference") instanceof File) return { kind: "upload", name: null };
      return { kind: "text", description: cleanText(form.get("lookName"), LIMITS.nameMax) };
    default:
      return errorResponse(400, { code: "bad_request", message: "Unknown try-on type." });
  }
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > LIMITS.totalBytes + 64_000) return errorResponse(413, { code: "too_large", message: "Those images are too large. Try a smaller photo." });

  const form = await request.formData().catch(() => null);
  if (!form) return errorResponse(400, { code: "bad_request", message: "A photo is required." });

  const target = await parseTarget(form);
  if (target instanceof Response) return target;
  const tweakRaw = form.get("tweak");
  const tweak = typeof tweakRaw === "string" && (TWEAKS as readonly string[]).includes(tweakRaw) ? tweakRaw : null;

  const photo = await readImage(form.get("photo"), LIMITS.photoBytes, "Your photo");
  if (photo instanceof Response) return photo;
  let upload: Blob | null = null;
  if (target.kind === "upload") {
    const read = await readImage(form.get("reference"), LIMITS.referenceBytes, "The reference image");
    if (read instanceof Response) return read;
    upload = read;
    if (photo.size + upload.size > LIMITS.totalBytes) return errorResponse(413, { code: "too_large", message: "Those images are too large together. Try a smaller photo." });
  }

  // Who pays: in demo mode there is no member, so the choice comes from this device's headers.
  const free = wantsFree(request) && !request.headers.get("x-hairpin-own-key");
  let provider: ProviderKind;
  let member: Awaited<ReturnType<typeof requireMember>> | null = null;
  if (publikMock) {
    const v = request.headers.get("x-hairpin-own-vendor");
    provider = request.headers.get("x-hairpin-own-key") ? (isVendor(v) ? v : "openai") : free ? "openai" : "publik";
  } else {
    member = await requireMember(request);
    if (!member.ok) return member.response;
    if (member.free) {
      const status = await freeStatus(request.headers);
      if (!status.enabled || !status.vendor) return errorResponse(503, { code: "free_unavailable", message: "Free try-ons aren't available right now. Use a publik plan or your own key." });
      provider = status.vendor;
    } else provider = editKind(member.provider);
  }

  const look = "lookId" in target ? await findLook(target.lookId) : null;
  const plan = planTryon({ target, provider, publikTrial: publikTrial(), look: look ? lookFacts(look) : null, tweak });
  if (!plan.ok) return errorResponse(plan.status, { code: plan.code, message: plan.message, ...(plan.alternative ? { alternative: plan.alternative } : {}) });

  let images: Blob[];
  try {
    if (plan.imageCount === 1) images = [photo];
    else images = [photo, target.kind === "upload" ? upload! : await referenceImage(look!)];
    // Last gate before any provider sees an image.
    assertSendable(provider, images.length, publikTrial());
  } catch {
    return errorResponse(500, { code: "reference_unavailable", message: "That look's reference image couldn't be loaded. Please try another look." });
  }

  const headers: Record<string, string> = {
    "Cache-Control": "no-store, private",
    "x-hairpin-mode": plan.mode,
    "x-hairpin-provider": provider,
    ...(plan.experimental ? { "x-hairpin-experimental": "1" } : {}),
  };

  if (publikMock) {
    if (free) {
      const t = await reserveFree(request.headers, true);
      if (!t.ok) return errorResponse(t.status, { code: t.code, message: t.message });
      headers["x-hairpin-free-remaining"] = String(t.remaining);
    }
    // Demo mode: echo the photo back untouched. The client labels it as a demo.
    return new Response(photo, { headers: { ...headers, "Content-Type": photo.type, "x-hairpin-mock": "1" } });
  }
  if (!member?.ok) return errorResponse(401, { code: "signed_out", message: "Please sign in again." });

  const ticket = await takeRenderTicket(member.userId);
  if (!ticket.ok) return Response.json({ error: { code: ticket.code, message: ticket.message } }, { status: ticket.status, headers: { "Retry-After": String(ticket.retryAfter) } });

  // The account's daily and monthly allowance, whoever pays.
  const allowance = await reserveAllowance(member.userId);
  if (!allowance.ok) {
    await ticket.release();
    return errorResponse(allowance.status, { code: allowance.code, message: allowance.message });
  }

  // Free try-ons: reserve one for this IP only now, after every check that could refuse the request for free.
  let freeTicket: FreeTicket | null = null;
  let ai: AiProvider;
  if (member.free) {
    freeTicket = await reserveFree(request.headers);
    if (!freeTicket.ok) {
      await allowance.refund();
      await ticket.release();
      return errorResponse(freeTicket.status, { code: freeTicket.code, message: freeTicket.message });
    }
    headers["x-hairpin-free-remaining"] = String(freeTicket.remaining);
    ai = { kind: "free", vendor: freeTicket.vendor, apiKey: freeTicket.apiKey };
  } else ai = member.provider;
  const refund = () => Promise.all([allowance.refund(), freeTicket?.ok ? freeTicket.refund() : Promise.resolve()]);

  try {
    const { data, chargeMicros } = await editImage(ai, { prompt: plan.prompt, images });
    const first = data.data?.[0];
    let bytes: ArrayBuffer;
    if (first?.b64_json) bytes = Uint8Array.from(Buffer.from(first.b64_json, "base64")).buffer;
    else if (first?.url && first.url.startsWith("https://")) bytes = await (await fetch(first.url, { cache: "no-store" })).arrayBuffer();
    else {
      await refund();
      return errorResponse(502, { code: "render_failed", message: "That didn't work. Please try again." });
    }
    // Streamed, because hosts such as Vercel cap a buffered response at 4.5 MB and a PNG render can pass that.
    return new Response(new Blob([bytes]).stream(), {
      headers: { ...headers, "Content-Type": "image/png", ...(chargeMicros === null ? {} : { "x-hairpin-charge-micros": String(chargeMicros) }) },
    });
  } catch (e) {
    await refund();
    return publikFailure(e);
  } finally {
    await ticket.release();
  }
}
