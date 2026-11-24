/**
 * Test-only sign-in, used to prove account isolation with two users on one device (scripts/e2e-accounts.cjs).
 *
 * Client side: active only when the build is not a production build AND NEXT_PUBLIC_HAIRPIN_TEST_AUTH=1 was set when
 * the dev server started. The tab then signs in as the uid in localStorage `hairpin.test-user`; that value alone can't
 * turn anything on.
 *
 * Server side (the part that matters): a `Bearer test:<uid>` token is accepted only when ALL of these hold at runtime:
 *   - NODE_ENV is exactly "development" (`next build` / `next start` always use "production"),
 *   - the server-only HAIRPIN_TEST_AUTH_SERVER=1 is set (never NEXT_PUBLIC, so no browser setting reaches it),
 *   - NEXT_PUBLIC_HAIRPIN_TEST_AUTH=1 is set,
 *   - it is not running on Vercel.
 * Production builds were checked to answer 401 to test tokens even with both flags set (design/app-redesign-audit.md).
 */
export const testAuthEnabled = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_HAIRPIN_TEST_AUTH === "1";

export function serverTestAuthEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.HAIRPIN_TEST_AUTH_SERVER === "1" &&
    process.env.NEXT_PUBLIC_HAIRPIN_TEST_AUTH === "1" &&
    !process.env.VERCEL
  );
}

export const TEST_USER_KEY = "hairpin.test-user";
export const isTestUid = (uid: unknown): uid is string => typeof uid === "string" && /^test-[a-z0-9]{1,24}$/.test(uid);
