import { errorResponse, publikFailure } from "@/lib/api-error";
import { barberBriefSchema, briefRequestSchema, type BarberBrief } from "@/lib/brief";
import { chat, publikConfigured, publikMock } from "@/lib/publik";
import { verifyCaller } from "@/lib/server-auth";

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
  try {
    const result = barberBriefSchema.safeParse(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
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
  if (!publikConfigured) return errorResponse(503, { code: "not_connected", message: "AI briefs aren't connected in this build yet." });
  if (!(await verifyCaller(request))) return errorResponse(401, { code: "signed_out", message: "Please sign in again." });

  const user = [`Haircut: ${lookName}.`, tweak ? `Adjustment: ${tweak}.` : "", notes ? `Client notes: ${notes}` : ""].filter(Boolean).join("\n");
  try {
    const first = await chat({ tier: "publik-balanced", system: SYSTEM, user, json: true });
    let brief = parse(first.data.choices?.[0]?.message?.content ?? "");
    if (!brief) {
      // One repair attempt, then the client shows a retry state.
      const repair = await chat({
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
