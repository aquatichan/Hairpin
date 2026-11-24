"use client";

import { DEVICE_SCOPE, getAccountScope } from "./account-scope";
import { adoptSavedLookIds } from "./library";
import { legacy as legacyDb } from "./local-store";
import { saveProfile, type Profile } from "./profile";
import { setChoice, type AiChoice } from "./ai-choice";

/**
 * Data saved before Phase E, when everything on a device was shared: the IndexedDB database `hairpin` and the
 * unscoped localStorage keys below. Nobody knows which account made it, so it is never moved into an account
 * silently. A signed-in person sees counts only (no images or names) and chooses to add it to their account or
 * delete it. Preview builds have no accounts, so there it simply carries over.
 */
const KEYS = { profile: "hairpin:profile", savedLooks: "hairpin:saved-looks", aiChoice: "hairpin.ai-choice" };

export type LegacySummary = { photo: boolean; renders: number; briefs: number; savedLooks: number; profile: boolean };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function savedIds(): string[] {
  const v = readJson<unknown>(KEYS.savedLooks);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function legacySummary(): Promise<LegacySummary | null> {
  const db = await legacyDb.summary().catch(() => null);
  const summary: LegacySummary = {
    photo: db?.photo ?? false,
    renders: db?.renders ?? 0,
    briefs: db?.briefs ?? 0,
    savedLooks: savedIds().length,
    profile: readJson(KEYS.profile) !== null,
  };
  // A stray own-key setting alone is not worth asking about; it is deleted below either way.
  const any = summary.photo || summary.renders || summary.briefs || summary.savedLooks || summary.profile;
  return any ? summary : null;
}

function removeKeys() {
  try {
    for (const key of Object.values(KEYS)) localStorage.removeItem(key);
  } catch {}
}

/** Moves everything into the account in scope. */
export async function adoptLegacy() {
  if (!getAccountScope()) return;
  await legacyDb.adopt();
  adoptSavedLookIds(savedIds());
  const profile = readJson<Partial<Profile>>(KEYS.profile);
  if (profile) saveProfile(profile);
  // An own OpenAI key is a credential: it only carries over where there are no accounts.
  if (getAccountScope() === DEVICE_SCOPE) {
    const choice = readJson<AiChoice>(KEYS.aiChoice);
    if (choice) setChoice(choice);
  }
  removeKeys();
}

export async function discardLegacy() {
  await legacyDb.discard();
  removeKeys();
}

/** Without accounts there is no one else it could belong to. */
export async function adoptLegacyOnPreview() {
  if (getAccountScope() !== DEVICE_SCOPE) return;
  if ((await legacySummary()) || readJson(KEYS.aiChoice)) await adoptLegacy();
}

/** An unowned own-key setting is never adopted by an account; delete it as soon as someone signs in. */
export function dropUnownedKey() {
  const scope = getAccountScope();
  if (!scope || scope === DEVICE_SCOPE) return;
  try {
    localStorage.removeItem(KEYS.aiChoice);
  } catch {}
}
