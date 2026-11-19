import { publikMock } from "@/lib/publik";
import { gateStatus } from "@/lib/publik-gate";

/** The gate screen polls this. It answers the caller's publik state and never a key. */
export async function GET(request: Request) {
  if (publikMock) return Response.json({ state: "claimed", hasPlan: true, topUpUrl: null });
  return Response.json(await gateStatus(request), { headers: { "Cache-Control": "no-store" } });
}
