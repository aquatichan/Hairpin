import { real } from "./env";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";

const config = {
  apiKey: real(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: real(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: real(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: real(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  appId: real(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
};

/** False until the Firebase web config is provided through env. */
export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId);

export function firebaseApp(): FirebaseApp {
  if (!firebaseConfigured) throw new Error("Firebase is not configured");
  return getApps().length ? getApp() : initializeApp(config);
}
