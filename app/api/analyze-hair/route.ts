import { chat, extractJson } from "@/lib/ai";
import { errorResponse, publikFailure } from "@/lib/api-error";
import { hairAnalysisSchema, type HairAnalysis } from "@/lib/hair-analysis";
import { publikMock } from "@/lib/publik";
import { requireKeyedMember } from "@/lib/publik-gate";
import { sniffImage } from "@/lib/tryon-plan";

const MAX_BYTES = 2_500_000;

const SYSTEM = `You look at a photo of a person and describe their hair only, so a hairstyle app can suggest suitable cuts.
Reply with one JSON object and nothing else, with exactly these keys:
hairType: one of 1a 1b 1c 2a 2b 2c 3a 3b 3c 4a 4b 4c (the Andre Walker scale: 1 straight, 2 wavy, 3 curly, 4 coily; a to c finer to tighter),
length: short | medium | long, color: the natural-looking colour in two or three plain words, density: fine | medium | thick,
confidence: low | medium | high, notes: one short sentence about what you could see (e.g. if the hair is tied up or styled straight).
Rules:
- Describe hair only. Never comment on the face, skin, body, age, gender, ethnicity or attractiveness.
- If the hair is hidden, tied back, heavily styled or the photo is unclear, give your best guess and set confidence to low.`;

/** POST /api/analyze-hair (multipart: photo). Returns { analysis, mock }. The photo is not stored. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return errorResponse(400, { code: "bad_request", message: "A photo is required." });
  if (photo.size > MAX_BYTES) return errorResponse(413, { code: "too_large", message: "That photo is too large. Try a smaller one." });
  const type = sniffImage(new Uint8Array(await photo.slice(0, 16).arrayBuffer()));
  if (!type) return errorResponse(415, { code: "bad_image", message: "That must be a JPEG, PNG or WebP image." });

  if (publikMock) {
    const analysis: HairAnalysis = { hairType: "3b", length: "medium", color: "dark brown", density: "medium", confidence: "low", notes: "Demo result: no AI looked at this photo." };
    return Response.json({ analysis, mock: true });
  }
  const member = await requireKeyedMember(request);
  if (!member.ok) return member.response;

  try {
    const imageDataUrl = `data:${type};base64,${Buffer.from(await photo.arrayBuffer()).toString("base64")}`;
    const reply = await chat(member.provider, { tier: "publik-balanced", system: SYSTEM, user: "Describe this person's hair.", imageDataUrl, json: true, schema: hairAnalysisSchema });
    const parsed = hairAnalysisSchema.safeParse(extractJson(reply.data.choices?.[0]?.message?.content ?? ""));
    if (!parsed.success) return errorResponse(502, { code: "render_failed", message: "The analysis didn't come out right. Please try again." });
    return Response.json({ analysis: parsed.data, mock: false }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (e) {
    return publikFailure(e);
  }
}
