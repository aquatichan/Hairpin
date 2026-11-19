import { errorResponse, publikFailure } from "@/lib/api-error";
import { barberBriefSchema, briefRequestSchema, type BarberBrief } from "@/lib/brief";
import { chat, extractJson } from "@/lib/ai";
import { publikMock } from "@/lib/publik";
import { requireMember } from "@/lib/publik-gate";

const SYSTEM = `You write a Barber Brief: clear instructions a client shows their barber.
Reply with one JSON object and nothing else, with exactly these keys:
styleName, top, sides, back, fringeOrPart, textureAndFinish, styling, maintenance (strings), askYourBarber, uncertain (arrays of short strings).
Rules:
- Use barber vocabulary.
- Never invent exact guard numbers or measurements unless the client stated them.
- Anything you are unsure of goes in askYourBarber as a question, and in uncertain as a note.
- Say in maintenance that the barber should adapt the cut to the client's current hair.
- No brand names. No comments on the client's face or attractiveness.`;

const DEMO = "Demo text. Connect Publik to write this section.";

function parse(text: string): BarberBrief | null {
  const result = barberBriefSchema.safeParse(extractJson(text));
  return result.success ? result.data : null;
}

export async function POST(request: Request) {
  const input = briefRequestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return errorResponse(400, { code: "bad_request", message: "A look is required." });
  const { lookName, tweak, notes } = input.data;

  if (publikMock) {
    const brief: BarberBrief = {
      styleName: lookName,
      top: DEMO, sides: DEMO, back: DEMO, fringeOrPart: DEMO, textureAndFinish: DEMO, styling: DEMO, maintenance: DEMO,
      askYourBarber: ["Demo brief: no AI wrote this."],
      uncertain: [],
    };
    return Response.json({ brief, mock: true });
  }
  const member = await requireMember(request);
  if (!member.ok) return member.response;

  const user = [`Haircut: ${lookName}.`, tweak ? `Adjustment: ${tweak}.` : "", notes ? `Client notes: ${notes}` : ""].filter(Boolean).join("\n");
  try {
    const first = await chat(member.provider, { tier: "publik-balanced", system: SYSTEM, user, json: true });
    let brief = parse(first.data.choices?.[0]?.message?.content ?? "");
    if (!brief) {
      // One repair attempt, then the client shows a retry state.
      const repair = await chat(member.provider, {
        tier: "publik-balanced",
        system: SYSTEM,
        user: `${user}\n\nYour last reply was not valid JSON for the required keys. Reply again with only the JSON object.`,
        json: true,
      });
      brief = parse(repair.data.choices?.[0]?.message?.content ?? "");
    }
    if (!brief) return errorResponse(502, { code: "render_failed", message: "The brief didn't come out right. Please try again." });
    return Response.json({ brief, mock: false });
  } catch (e) {
    return publikFailure(e);
  }
}
