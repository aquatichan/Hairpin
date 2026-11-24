"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEVICE_SCOPE, setAccountScope } from "@/lib/account-scope";
import { setChoice } from "@/lib/ai-choice";
import { firebaseApp, firebaseConfigured } from "@/lib/firebase";
import { TEST_USER_KEY, isTestUid, testAuthEnabled } from "@/lib/test-auth";

export type AuthStatus = "loading" | "signed-in" | "signed-out" | "unconfigured";
export type AuthUser = { uid: string; name: string | null; photoUrl: string | null; /** ISO date the account was created, when the sign-in provider says. */ createdAt: string | null };

type AuthValue = {
  status: AuthStatus;
  user: AuthUser | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Deletes the Firebase account (signing in again first if Firebase asks). Server and device data go first. */
  deleteAuthAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/** Per-tab flags that must not carry over to the next person on this device. */
function clearSessionFlags() {
  try {
    sessionStorage.removeItem("hairpin.welcome-step");
    sessionStorage.removeItem("hairpin.publik-redirected");
    sessionStorage.removeItem("hairpin.legacy-later");
  } catch {}
}

function readTestUser(): AuthUser | null {
  try {
    const uid = localStorage.getItem(TEST_USER_KEY);
    return isTestUid(uid) ? { uid, name: uid, photoUrl: null, createdAt: null } : null;
  } catch {
    return null;
  }
}

const initialStatus: AuthStatus = testAuthEnabled || firebaseConfigured ? "loading" : "unconfigured";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(initialStatus);
  const [user, setUser] = useState<AuthUser | null>(null);

  // The scope is set before the status, so nothing renders as signed in while storage still points elsewhere.
  const apply = useCallback((u: AuthUser | null) => {
    setAccountScope(u ? u.uid : null);
    setUser(u);
    setStatus(u ? "signed-in" : "signed-out");
  }, []);

  useEffect(() => {
    if (testAuthEnabled) {
      queueMicrotask(() => apply(readTestUser()));
      return;
    }
    if (!firebaseConfigured) {
      // Preview builds have no accounts: one person per device.
      setAccountScope(DEVICE_SCOPE);
      return;
    }
    let unsubscribe = () => {};
    let cancelled = false;
    import("firebase/auth").then(({ getAuth, onAuthStateChanged }) => {
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(getAuth(firebaseApp()), (u) => apply(u ? { uid: u.uid, name: u.displayName, photoUrl: u.photoURL, createdAt: u.metadata?.creationTime ? new Date(u.metadata.creationTime).toISOString() : null } : null));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [apply]);

  const signInWithGoogle = useCallback(async () => {
    if (testAuthEnabled) {
      const next = readTestUser() ?? { uid: "test-a", name: "test-a", photoUrl: null, createdAt: null };
      localStorage.setItem(TEST_USER_KEY, next.uid);
      apply(next);
      return;
    }
    const { getAuth, GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
    await signInWithPopup(getAuth(firebaseApp()), new GoogleAuthProvider());
  }, [apply]);

  const signOut = useCallback(async () => {
    // While this account is still in scope: forget its own OpenAI key on this device and this tab's flags.
    setChoice(null);
    clearSessionFlags();
    if (testAuthEnabled) {
      localStorage.removeItem(TEST_USER_KEY);
      apply(null);
      return;
    }
    const auth = await import("firebase/auth");
    await auth.signOut(auth.getAuth(firebaseApp()));
  }, [apply]);

  const deleteAuthAccount = useCallback(async () => {
    setChoice(null);
    clearSessionFlags();
    if (testAuthEnabled) {
      localStorage.removeItem(TEST_USER_KEY);
      apply(null);
      return;
    }
    const { getAuth, GoogleAuthProvider, reauthenticateWithPopup, deleteUser } = await import("firebase/auth");
    const current = getAuth(firebaseApp()).currentUser;
    if (!current) return;
    try {
      await deleteUser(current);
    } catch (e) {
      // Firebase only deletes an account after a recent sign-in.
      if ((e as { code?: string }).code !== "auth/requires-recent-login") throw e;
      await reauthenticateWithPopup(current, new GoogleAuthProvider());
      await deleteUser(current);
    }
  }, [apply]);

  const value = useMemo(() => ({ status, user, signInWithGoogle, signOut, deleteAuthAccount }), [status, user, signInWithGoogle, signOut, deleteAuthAccount]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
