import { publikMock } from "@/lib/publik";
import { freeStatus } from "@/lib/free-tryons.server";

/** GET -> { enabled, remaining, perIp, vendor }: how many free try-ons this IP has left. No content, no account data. */
export async function GET(request: Request) {
  return Response.json(await freeStatus(request.headers, publikMock), { headers: { "Cache-Control": "no-store, private" } });
}
