"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setChoice } from "@/lib/ai-choice";
import { firebaseApp, firebaseConfigured } from "@/lib/firebase";

export type AuthStatus = "loading" | "signed-in" | "signed-out" | "unconfigured";
export type AuthUser = { uid: string; name: string | null; photoUrl: string | null };

type AuthValue = {
  status: AuthStatus;
  user: AuthUser | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(firebaseConfigured ? "loading" : "unconfigured");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let unsubscribe = () => {};
    let cancelled = false;
    import("firebase/auth").then(({ getAuth, onAuthStateChanged }) => {
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(getAuth(firebaseApp()), (u) => {
        setUser(u ? { uid: u.uid, name: u.displayName, photoUrl: u.photoURL } : null);
        setStatus(u ? "signed-in" : "signed-out");
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { getAuth, GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
    await signInWithPopup(getAuth(firebaseApp()), new GoogleAuthProvider());
  }, []);

  const signOut = useCallback(async () => {
    const auth = await import("firebase/auth");
    await auth.signOut(auth.getAuth(firebaseApp()));
    setChoice(null); // the next person on this device must not inherit an own key
  }, []);

  const value = useMemo(
    () => ({ status, user, signInWithGoogle, signOut }),
    [status, user, signInWithGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
