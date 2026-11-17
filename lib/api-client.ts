import { firebaseApp, firebaseConfigured } from "./firebase";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly topUpUrl?: string,
  ) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  if (!firebaseConfigured) return {};
  const { getAuth } = await import("firebase/auth");
  const token = await getAuth(firebaseApp()).currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { ...init.headers, ...(await authHeader()) } });
  } catch {
    throw new ApiClientError("You seem to be offline. Check your connection and try again.", "offline");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiClientError(body?.error?.message ?? "Something went wrong. Please try again.", body?.error?.code ?? "unknown", body?.error?.topUpUrl);
  }
  return response;
}
