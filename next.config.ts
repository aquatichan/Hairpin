import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  // /api/tryon reads Discover reference portraits from disk; ship them with that function.
  outputFileTracingIncludes: {
    "/api/tryon": ["./public/assets/gallery/**/*", "./public/assets/transformations/**/*", "./public/assets/looks/**/*"],
  },
  // The on-device face model and its WASM runtime never change for a given path: cache them for a year. When
  // upgrading @mediapipe/tasks-vision, copy the new files to a NEW folder (e.g. /mediapipe/v2) and update lib/face-detect.ts.
  async headers() {
    return [{ source: "/mediapipe/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
  // Community cut photos come from Vercel Blob. They are already small (one 960px copy, ~100 KB), so they are shown
  // unoptimized to stay clear of image-optimizer quotas; the pattern still lets next/image accept the host.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
    // Next keeps resized copies of each image for hours. In development that hid every edit to a same-named file
    // (swapped or re-framed portraits kept showing their old version), so dev re-checks the file almost immediately.
    ...(process.env.NODE_ENV === "development" ? { minimumCacheTTL: 1 } : {}),
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
