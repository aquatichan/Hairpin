import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { real } from "./env";
import { isTestUid, serverTestAuthEnabled } from "./test-auth";

/**
 * Returns the caller's Firebase uid, or null if the request carries no valid
 * ID token. A Firebase ID token is a JWT signed by Google, so checking it only
 * needs the project id and Google's public signing keys: no service account,
 * and no firebase-admin (it fails to load on Vercel's runtime).
 */
const KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

export async function verifyCaller(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  // Development-only test accounts (lib/test-auth.ts): refused unless every server-side condition holds at runtime.
  if (token?.startsWith("test:") && serverTestAuthEnabled()) {
    const uid = token.slice(5);
    return isTestUid(uid) ? uid : null;
  }
  const projectId = real(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  if (!token || !projectId) return null;
  try {
    const { payload } = await jwtVerify(token, KEYS, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
