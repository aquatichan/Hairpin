import { devImage } from "@/lib/posts.server";

/** Development only: serves images kept in memory when Vercel Blob isn't configured. Production uses Blob URLs. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const { name } = await params;
  const img = /^p-[a-f0-9]{12}\.(webp|jpg)$/.test(name) ? devImage(name) : null;
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img.bytes), { headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=3600" } });
}
