import "server-only";
import { real } from "./env";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * Returns the caller's Firebase uid, or null if the request carries no valid
 * ID token. Uses Application Default Credentials, which Firebase App Hosting
 * provides; locally, run `gcloud auth application-default login`.
 */
export async function verifyCaller(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const projectId = real(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  if (!token || !projectId) return null;
  try {
    const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
    return (await getAuth(app).verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}
