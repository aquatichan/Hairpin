// TEMPORARY: reports which server module fails to load. Names and yes/no only, never values. Delete after use.
const mods: Record<string, () => Promise<unknown>> = {
  "server-auth": () => import("@/lib/server-auth"),
  "publik.server": () => import("@/lib/publik.server"),
  ai: () => import("@/lib/ai"),
  "api-error": () => import("@/lib/api-error"),
  "publik-gate": () => import("@/lib/publik-gate"),
};

export async function GET() {
  const results: Record<string, string> = {};
  for (const [name, load] of Object.entries(mods)) {
    try {
      await load();
      results[name] = "ok";
    } catch (e) {
      results[name] = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : "failed";
    }
  }
  const has = (k: string) => (process.env[k] ? `set (${process.env[k]!.length} chars)` : "missing");
  const env = Object.fromEntries(
    ["PUBLIK_APP_TOKEN", "PUBLIK_INSTALL_SECRET", "KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "PUBLIK_MOCK"].map((k) => [k, has(k)]),
  );
  return Response.json({ node: process.version, results, env }, { headers: { "Cache-Control": "no-store" } });
}
