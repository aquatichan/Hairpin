// TEMPORARY: reports which server module or route fails. Names, yes/no and error text only, never values. Delete after use.
const mods: Record<string, () => Promise<unknown>> = {
  "server-auth": () => import("@/lib/server-auth"),
  "publik.server": () => import("@/lib/publik.server"),
  ai: () => import("@/lib/ai"),
  "api-error": () => import("@/lib/api-error"),
  "publik-gate": () => import("@/lib/publik-gate"),
  "route:status": () => import("../status/route"),
  "route:brief": () => import("../../brief/route"),
};

const text = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}\n${(e.stack ?? "").split("\n").slice(1, 5).join("\n")}` : String(e)).slice(0, 700);

export async function GET(request: Request) {
  const results: Record<string, string> = {};
  for (const [name, load] of Object.entries(mods)) {
    try {
      await load();
      results[name] = "ok";
    } catch (e) {
      results[name] = text(e);
    }
  }
  try {
    const { GET: status } = await import("../status/route");
    const res = await status(new Request(new URL("/api/publik/status", request.url)));
    results["call:status"] = `${res.status} ${(await res.text()).slice(0, 200)}`;
  } catch (e) {
    results["call:status"] = text(e);
  }
  const has = (k: string) => (process.env[k] ? `set (${process.env[k]!.length} chars)` : "missing");
  const env = Object.fromEntries(
    ["PUBLIK_APP_TOKEN", "PUBLIK_INSTALL_SECRET", "KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "PUBLIK_MOCK", "PUBLIK_ORIGIN", "NODE_ENV", "VERCEL_ENV"].map((k) => [k, has(k)]),
  );
  return Response.json({ node: process.version, results, env }, { headers: { "Cache-Control": "no-store" } });
}
