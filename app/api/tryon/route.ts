import { errorResponse, publikFailure } from "@/lib/api-error";
import { editImage } from "@/lib/ai";
import { publikMock } from "@/lib/publik";
import { requireMember } from "@/lib/publik-gate";

const MAX_BYTES = 4 * 1024 * 1024; // Publik's request body limit
const TWEAKS = ["Shorter", "Longer", "More volume", "Curtain fringe", "Lower fade", "Messier texture"];

function prompt(lookName: string | null, hasReference: boolean, tweak: string | null) {
  const target = hasReference
    ? "to match the haircut in image 2: cut, length, texture, parting and fringe"
    : `to a ${lookName} haircut`;
  return [
    `Change only the hair on the person in image 1 ${target}.`,
    tweak ? `Adjustment: ${tweak.toLowerCase()}.` : "",
    "Keep the person's face, skin, expression, clothing, background and lighting identical. Photorealistic.",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  const reference = form?.get("reference");
  const lookName = typeof form?.get("lookName") === "string" ? String(form.get("lookName")).slice(0, 80) : null;
  const tweakRaw = form?.get("tweak");
  const tweak = typeof tweakRaw === "string" && TWEAKS.includes(tweakRaw) ? tweakRaw : null;

  if (!(photo instanceof File) || !photo.type.startsWith("image/")) {
    return errorResponse(400, { code: "bad_request", message: "A photo is required." });
  }
  const hasReference = reference instanceof File && reference.type.startsWith("image/");
  if (!hasReference && !lookName) return errorResponse(400, { code: "bad_request", message: "Pick a look or add a reference." });
  if (photo.size + (hasReference ? reference.size : 0) > MAX_BYTES) {
    return errorResponse(413, { code: "too_large", message: "Those images are too large. Try a smaller photo." });
  }

  if (publikMock) {
    // Demo mode: echo the photo back untouched. The client labels it as a demo.
    return new Response(photo, { headers: { "Content-Type": photo.type, "x-hairpin-mock": "1" } });
  }
  const member = await requireMember(request);
  if (!member.ok) return member.response;

  try {
    const { data, chargeMicros, provider } = await editImage(member.provider, {
      prompt: prompt(lookName, hasReference, tweak),
      images: hasReference ? [photo, reference] : [photo],
    });
    const first = data.data?.[0];
    let bytes: ArrayBuffer;
    if (first?.b64_json) bytes = Uint8Array.from(Buffer.from(first.b64_json, "base64")).buffer;
    else if (first?.url) bytes = await (await fetch(first.url)).arrayBuffer();
    else return errorResponse(502, { code: "render_failed", message: "That didn't work. Please try again." });
    // Streamed, because hosts such as Vercel cap a buffered response at 4.5 MB and a PNG render can pass that.
    return new Response(new Blob([bytes]).stream(), {
      headers: { "Content-Type": "image/png", "x-hairpin-provider": provider, ...(chargeMicros === null ? {} : { "x-hairpin-charge-micros": String(chargeMicros) }) },
    });
  } catch (e) {
    return publikFailure(e);
  }
}
