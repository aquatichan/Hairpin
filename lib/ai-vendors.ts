/**
 * AI providers a person can bring their own key for, and what each one can do in Hairpin. Isomorphic and
 * dependency-free: the gate's key form, the studio and the server all read this.
 *
 * Contracts were checked against each provider's own docs on 2026-11-22 (see design/app-redesign-audit.md);
 * none has been run with a real key in this work.
 */
export const VENDORS = ["openai", "gemini", "openrouter", "anthropic"] as const;
export type Vendor = (typeof VENDORS)[number];
export const isVendor = (v: unknown): v is Vendor => typeof v === "string" && (VENDORS as readonly string[]).includes(v);

export type VendorInfo = {
  label: string;
  /** What the key form says it covers. */
  covers: string;
  placeholder: string;
  keysUrl: string;
};

export const VENDOR_INFO: Readonly<Record<Vendor, VendorInfo>> = Object.freeze({
  openai: {
    label: "OpenAI",
    covers: "Try-ons with reference matching, Decode and Barber Briefs.",
    placeholder: "sk-…",
    keysUrl: "https://platform.openai.com/api-keys",
  },
  gemini: {
    label: "Google Gemini",
    covers: "Try-ons with reference matching, Decode and Barber Briefs.",
    placeholder: "AIza…",
    keysUrl: "https://aistudio.google.com/apikey",
  },
  openrouter: {
    label: "OpenRouter",
    covers: "Try-ons from a written description, Decode and Barber Briefs. Reference matching isn't confirmed there yet.",
    placeholder: "sk-or-…",
    keysUrl: "https://openrouter.ai/keys",
  },
  anthropic: {
    label: "Anthropic",
    covers: "Decode and Barber Briefs. Claude can't make images, so try-ons need publik, free try-ons or another key.",
    placeholder: "sk-ant-…",
    keysUrl: "https://console.anthropic.com/settings/keys",
  },
});

/** Providers whose keys can make try-on images at all. */
export const canRenderImages = (v: Vendor) => v !== "anthropic";

/** A loose sanity check only; each provider is the judge of its own keys. */
export const looksLikeKey = (key: string) => key.length >= 20 && key.length <= 300 && !/\s/.test(key);
