import { chat, extractJson } from "@/lib/ai";
import { errorResponse, publikFailure } from "@/lib/api-error";
import { decodedCutSchema, type DecodedCut } from "@/lib/brief";
import { publikMock } from "@/lib/publik";
import { requireKeyedMember } from "@/lib/publik-gate";

const MAX_BYTES = 3 * 1024 * 1024; // stays under Publik's 4 MB body limit once base64-encoded

const SYSTEM = `You look at a photo of a haircut and describe the haircut only, in barber vocabulary.
Reply with one JSON object and nothing else, with exactly these keys:
styleName, summary, top, sides, back, texture (strings), upkeep ("low" | "medium" | "high"), askFor (array of up to 6 short phrases to say to a barber).
Rules:
- Describe hair only. Never describe, rate or comment on the person's face, body, age, gender or attractiveness.
- Never invent exact guard numbers or measurements. If something can't be seen, say so in that field.
- If the image does not show a haircut, set styleName to "No haircut found" and explain in summary.
- Never say who the cut would suit or how it would look on someone else.`;

const DEMO = "Demo text. Connect Publik to analyse this image.";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File) || !image.type.startsWith("image/")) {
    return errorResponse(400, { code: "bad_request", message: "An image is required." });
  }
  if (image.size > MAX_BYTES) return errorResponse(413, { code: "too_large", message: "That image is too large. Try a smaller one." });

  if (publikMock) {
    const cut: DecodedCut = { styleName: "Demo result", summary: DEMO, top: DEMO, sides: DEMO, back: DEMO, texture: DEMO, upkeep: "medium", askFor: [] };
    return Response.json({ cut, mock: true });
  }
  const member = await requireKeyedMember(request);
  if (!member.ok) return member.response;

  try {
    const imageDataUrl = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
    const reply = await chat(member.provider, { tier: "publik-balanced", system: SYSTEM, user: "Describe this haircut.", imageDataUrl, json: true, schema: decodedCutSchema });
    const cut = decodedCutSchema.safeParse(extractJson(reply.data.choices?.[0]?.message?.content ?? ""));
    if (!cut.success) return errorResponse(502, { code: "render_failed", message: "The analysis didn't come out right. Please try again." });
    return Response.json({ cut: cut.data, mock: false });
  } catch (e) {
    return publikFailure(e);
  }
}
