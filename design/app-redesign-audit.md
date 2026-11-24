# App redesign audit (live tree)

Branch `app-redesign`, cut from `main` at `aea7d40` (landing merged, working tree clean).
Baseline screenshots of the landing page and the app routes were taken from a production build
in unconfigured-auth mode, at 390x844, 820x1180, 1440x900 and 1920x1080. No route had sideways
scroll or console errors.

## Differences from the handoff's snapshot audit

| Handoff says | Live tree | Impact |
|---|---|---|
| Discover has search, filters and a detail sheet with Try handoff | True, but `content/gallery.json` is `[]`, so `libraryLooks` is empty and Discover only shows the "library is being stocked" state | Phase C needs real library content; the Muse before/after package was never applied. The 12 approved landing portraits exist in `public/assets/gallery/` |
| Landing in `components/landing/**` | Also `/privacy` and `/terms`, built on the landing styles | Frozen together with the landing |
| Onboarding is 3 slides plus a preferences step | Confirmed: 4 steps, no skip | Phase B |
| `/welcome` is gated | It sits outside `app/(app)`, so it is **not** behind auth or `PublikGate`. It only writes local preferences and then routes into gated pages | Keep it that way; finishing onboarding can't bypass the gate |
| `next` is checked as same-site | `startsWith("/") && !startsWith("//")` lets `/\evil.com` through, which browsers treat like `//evil.com` | Fixed in Phase B with an origin check |
| Old marketing hero | `components/hero.tsx`, `hero-video.tsx`, `marquee.tsx` and `sign-in.tsx` are no longer used by `/` (the landing replaced them). `marquee.tsx` is still used by `/welcome` | Unused files left alone; remove only with approval |
| Shell | Sidebar plus 5 bottom tabs, no skip link, no logo on mobile, no safe-area top padding | Phase A |

## Facts that constrain the redesign

- **Auth:** `AppShell` redirects signed-out people to `/`, hides content while auth loads, and wraps signed-in content in `PublikGate`. Unconfigured builds render the app with a preview notice.
- **Storage:** everything is local. The photo, renders and briefs are in IndexedDB v1 (`lib/local-store.ts`), the profile is in localStorage (`lib/profile.ts`), and the AI choice is in local storage. Nothing syncs across devices.
- **Terminology:** "Saved" holds renders and briefs; there is no boards model. The landing nav says "Boards", which points at a feature the app does not have yet (decision 2).
- **Unverified backend paths:** `/api/tryon`, `/api/decode`, `/api/brief` and `/api/publik/status` have not been run with real credentials in this work.
- **Pre-existing UX issues for later phases:** Saved deletes renders and briefs with no confirmation (Phase E). `BottomSheet` relies on native `<dialog>` focus return (Phase C).

## Phased plan

- **A. Shell and primitives:**
  - Mobile top bar with logo and safe-area padding.
  - Refined sidebar with an active indicator and focus states.
  - Translucent bottom bar with a clear active state and safe-area padding.
  - Skip link and a nav-clearance utility.
  - Focus and press states on `Button`/`Chip`, plus a `PageHeader` primitive for later phases.
  - The auth gating logic is unchanged.
- **B. Onboarding:**
  - Three screens, skippable from every screen.
  - Optional length and texture, preselected from any existing profile.
  - Skip still sets `onboardedAt` and never erases saved preferences.
  - Hardened `next` check and double-submit guard.
  - The step survives reload, and focus moves to each new heading.
  - No camera or upload.
  - Can be reopened from You.
- **C:** Discover, below.
- **D:** Try studio, below.
- **E:** Saved, Boards and account isolation, below.
- **F:** Integration, polish and release readiness, below.

## Phase C: Discover (done, awaiting review)

- **Library:** `content/gallery.json` now holds eight looks. They are the "after" portraits of eight distinct models, reusing the approved landing files, so nothing is duplicated.
  - Every entry has a genuinely matched `before` of the same model, from the AI-generated pairs approved earlier. No new pairs were made.
  - Each entry is marked `illustrative: true` and has alt text and barber notes.
- **Data contract:** `Look` gains optional `alt`, `before` and `illustrative` fields. Existing fields and `scripts/import-photos.mjs` are unchanged, and imported photos still work without the new fields.
- **Save:** `lib/saved-looks.ts` keeps saved look IDs in localStorage under `hairpin:saved-looks`, on this device only. It has no IndexedDB schema change, and "Delete all my data" clears it.
- **Try handoff:** unchanged. The link is `/try?look=<id>`, which still goes through `/welcome?next=…` on a first try. Try finds the look by ID and sends its name to `/api/tryon`, so the API contract is untouched.
- **Comparison:** the before/after view is only offered when a look has `before`. It is captioned as an illustrative AI example, not a Hairpin try-on result.

## Phase D: AI Try-On studio (done, awaiting review)

### Provider capabilities

| Provider | Two-image edit (selfie + hairstyle reference) | Status | Source |
|---|---|---|---|
| Your own OpenAI key (`/v1/images/edits`) | Up to 16 `image[]` inputs for GPT image models | **Verified from docs**, not yet run with a real key | developers.openai.com/api/reference/resources/images, checked 2026-11-22 |
| publik (`/images/edits`) | Endpoint exists (401 without a key, 404 for unknown paths); multi-image input, model and limits are undocumented | **Unverified. Disabled** | publikhq.com/developers lists `/images/generations` only |
| publik and OpenAI, one image (photo + text) | Single-image edit | Works through the existing path (publik not yet run with real credentials in this work) | |

- The table lives in `lib/tryon-plan.ts` (`PROVIDER_CAPABILITY`). It is frozen, and publik only gets two images when `NEXT_PUBLIC_PUBLIK_REFERENCE_TRIAL=1` is set for the validation below; trial results are labelled "Experimental".
- `gpt-image-1` was shut down on 2026-10-23. The own-key path used it by default, so it was broken before this phase. The default is now `gpt-image-2.6-sunburst` (OpenAI's documented default), `quality=medium`, `n=1`. `OPENAI_IMAGE_MODEL` still overrides it; if it is set to `gpt-image-1` in Vercel, remove it.

### API changes (`POST /api/tryon`, multipart, backwards compatible)

- **New fields:**
  - `target`: `catalog-reference`, `catalog-describe`, `upload` or `text`.
  - `lookId`: a catalog slug.
  - `description`: up to 240 characters.
  - `referenceName`: optional label for an uploaded screenshot.
- **Unchanged:** `photo`, `reference` and `tweak`. A request without `target` behaves as before: with `reference` it is treated as `upload`, otherwise `lookName` is the description.
- **Catalog portraits are resolved on the server.**
  - `lookId` must match a slug pattern and exist in `content/gallery.json`.
  - The file path comes from the catalog, must sit under `public/assets/gallery|transformations/`, and is read from disk.
  - `next.config.ts` bundles those folders with the route. The client never sends a portrait or URL.
- **Refusals:** a reference target on a provider that isn't cleared returns `409 reference_unsupported` with `alternative: catalog-describe | text`. It is never downgraded to text.
- **Defense in depth:** `assertSendable()` re-checks the real image count against the provider right before the provider call.
- **Validation:**
  - Images are checked by their bytes (JPEG, PNG or WebP only).
  - Size limits: photo 2.5 MB, reference 1.2 MB, total 3.8 MB (publik's 4 MB body limit). Oversized requests are refused by `Content-Length` before parsing.
  - Free text is stripped of control and bidi characters and capped. Tweaks come from an allowlist.
- **Cost guard (`lib/render-guard.server.ts`):** one render in flight per person and 12 per 10 minutes, returning 429 with `Retry-After`. This is in-memory per server instance, so it is not a cross-instance limit. The client still guards double taps.
- **Privacy:**
  - Responses are `Cache-Control: no-store, private`.
  - Images are never written to disk or logged on the server.
  - Renders stay in IndexedDB on the device. New optional `mode` and `experimental` fields need no schema change.
- **Prompts:**
  - Image 1 is the person, kept for identity, skin, facial hair, makeup, pose, expression, clothing, accessories, background, lighting, framing and their own hair colour.
  - Image 2 contributes only hair shape, length, texture, parting, volume and styling. The prompt explicitly lists what must not be copied from it.

### Studio

- **Photo:** add with consent, replace, or remove (two-step).
- **Hairstyle source:**
  - Library: portrait preview, Change, and a method choice between the reference portrait and the written description.
  - Describe: free text.
  - Screenshot: the Decode handoff now carries Decode's name and summary, or an upload.
- **Unsupported reference:** a clear explanation with two explicit choices, the written description or the person's own key. Generate stays disabled until one is chosen.
- **Generating:** the Hairpin loader with staged status and "Stop waiting".
- **Result:**
  - Before/after with provenance ("Matched to the reference portrait of…" or "Made from a written description of… The reference portrait was not sent.").
  - Fine-tune chips, Create Barber Brief, Generate again and Delete. Results are saved on the device automatically.
- **Errors:** each code has an action (top up, use the description, check my key, sign in again, try again).

### Loader

`components/ui/hairpin-loader.tsx`, styles in `app/globals.css` (`.hl*`).

- **Where it's used:** sign-in wait (app shell), publik gate, app route loading, studio, Decode, Brief. Not on the landing page.
- **Design:**
  - 170 BPM step animations: hard-cut gold blooms and falling petals, a monogram with RGB-split and slice glitches, racing outlined HAIRPIN rows, grain and scanlines.
  - The status line decrypts itself, in the spirit of React Bits' DecryptedText. It's hand-written, with no package added.
- **Accessibility:** glitches stay in small areas, with no full-screen flashing. There is one plain `role="status"` for screen readers, and reduced motion gets a still composition.

### Also fixed

- **BottomSheet under `next dev`:** React's development double-mount closed the native `<dialog>`, and the delayed `close` event shut the sheet right after it opened. So Discover looks and the studio picker would not open in development. `onClose` now only counts a dialog that is actually closed. Production builds were not affected.

### Publik two-image validation (needs your signed-in account)

Purpose: evidence that publik uses the second image. During the trial the reference prompt is blind (no style name or description), so a matching cut can only come from the image.

1. Add `NEXT_PUBLIC_PUBLIK_REFERENCE_TRIAL=1` to `.env.local` and restart `npm run dev`; the variable is read at start-up.
2. Sign in, choose "Connect your plan" (publik), and add one clear, front-facing selfie.
3. Library → **Sleek low bun** → "Match the reference portrait" (badge: Experimental) → Generate. Save a screenshot.
4. Library → **Natural afro** → "Match the reference portrait" → Generate. Save a screenshot.
5. Controls: repeat 3 and 4 with "Use the written description". That makes 4 renders in total.
6. **Evidence that both images are used:** the blind results in 3 and 4 differ from each other and each follows its own reference. Sleek low bun should be pulled back, centre-parted, sleek and long. Natural afro should be rounded, voluminous and coily.
7. **Evidence that the second image is ignored:** the blind results look alike, look generic, or keep your own hair. In that case publik stays disabled.
8. **Attribute leakage check:** in every result, the face, skin tone, expression, clothing and background must still be yours. Anything from the reference model besides the hair is a fail, even if the hair matches.
9. Send me the four images or your verdict. Enabling publik is then a one-line, reviewed change in `PROVIDER_CAPABILITY`, plus removing the trial variable.

### Not tested in Phase D

- **Real providers:** no real OpenAI or publik render was made; there are no credentials in this environment. Two-image support on OpenAI is verified from its docs only.
- **Signed-in flows:** the Firebase sign-in, the publik gate and an authenticated `/api/tryon` request with a real token were not run. Unauthenticated requests return 401 "Please sign in again" (production build).
- **Mobile camera capture** ("Take a selfie") and HEIC input were not tried on real devices.

## Phase E: Saved, Boards and account isolation (done, awaiting review)

### Storage audit (before this phase)

Everything was shared by the whole browser. A second Google account on the same device saw the first person's photo, try-ons, briefs, preferences and saved looks, and used their own OpenAI key.

| Data | Where | Before | Now |
|---|---|---|---|
| Selfie, try-on images, Barber Briefs | IndexedDB | One database, `hairpin` | One database per account: `hairpin@<uid>` (`hairpin@device` in preview builds) |
| Hair profile, onboarding | localStorage | `hairpin:profile` | `hairpin:profile@<uid>` |
| Own OpenAI key / AI choice | localStorage | `hairpin.ai-choice` | `hairpin.ai-choice@<uid>`. Removed on sign-out and on Delete all my data. An unowned old key is deleted when an account signs in |
| Saved looks | localStorage | `hairpin:saved-looks` | Part of the account library: `hairpin:library@<uid>` locally, plus the server copy below |
| Boards | none | none | Same library document |
| Welcome step, publik redirect flag, "decide later" | sessionStorage | per tab | Cleared on sign-out |
| Firebase's own sign-in session | IndexedDB (Firebase) | unchanged | unchanged |

### How isolation works

- **Account scope (`lib/account-scope.ts`):**
  - The scope is the Firebase uid when someone is signed in, `device` in preview builds without sign-in, and `null` while sign-in resolves or after sign-out.
  - The scope is set before the app reports the signed-in state.
  - Every private read and write waits for a scope (`whenScoped`). There is no shared fallback key.
- **Late try-on results:** a render finishing after its owner signed out is dropped, not written into the next account (`localStore.putFor`).
- **Server routes:** `/api/library` only ever uses the uid from the verified token. There is no parameter that names an account.

### Pre-existing data (migration)

- **Configured builds:** data saved before this phase (the `hairpin` database and the old shared keys) has no known owner, so it is never moved silently.
  - A signed-in person sees a prompt with counts only, no images or names.
  - The choices are "They're mine, add them", "Delete them" (two-step) or "Decide later" (for this session).
- **Preview builds:** there are no accounts, so the old data carries over automatically, including the AI choice.
- **Old own-key setting:** an unowned own OpenAI key setting is never adopted by an account.

### Saved looks and Boards

- **Model (`lib/library-model.ts`):**
  - A board holds look IDs only, never images or copies, so a look can be in many boards and is stored once.
  - Adding a look to a board also saves it.
  - Unsaving, removing from a board and deleting a board never affect the others.
  - Limits: 50 boards, 200 looks per board, 500 saved looks, names of 40 characters with duplicates refused ignoring case.
- **Sync:** changes apply instantly to the per-account local copy, then sync to `PUT /api/library`.
  - The server stores one JSON document per uid in Upstash: `hairpin:library:<uid>`, holding IDs, names and timestamps only.
  - If another device changed it since this device's last sync, both versions are merged. Saved looks and boards are unioned, and the newer board edit wins. A board deleted on one device while edited on another can reappear.
  - Development without Redis keeps documents in memory. Production without Redis returns `503 sync_unavailable`, and the app keeps working with the device copy only.
- **Why not Firestore:** Hairpin only uses Firebase Auth. Firestore isn't enabled, and earlier guidance was not to switch persistence to it without an approved plan. Upstash is already required in production, so this adds no new service.
- **Private items stay on the device:** selfies, try-ons and briefs never sync. Nothing private goes to any public or shared storage.

### Retention and deletion

- **Sign-out:**
  - Forgets the account's own OpenAI key on this device and clears per-tab flags.
  - The account's photo, try-ons, briefs, profile and library copy stay on the device, out of reach of other accounts, and return when that account signs in again.
  - Its library also stays on the server.
- **Delete all my data (You):**
  - On this device: clears this account's IndexedDB stores, profile, library copy and AI choice.
  - On the server: deletes this account's library document.
  - Other accounts on the device are untouched.
  - If the server can't be reached, the person is told that their boards weren't removed from the account yet.
- **Clearing site data in the browser:** removes everything on the device for all accounts. Server libraries remain until "Delete all my data" is used, or the owner deletes them on request (privacy policy contact).
- **Retention on the server:**
  - Library documents are kept until deleted.
  - Render counters expire after their 10-minute window.
  - Render locks expire after 3 minutes.
- **Firebase account deletion:** there is no self-serve account deletion in the app; it is by request, as the policy says. That request should include deleting `hairpin:library:<uid>` and `publik:user:<uid>`.
- **Privacy policy:** updated with per-account separation on shared devices, the saved looks and boards section, Upstash's additional uses and the in-app delete. This is a change to a page frozen with the landing, so it needs owner review.

### Rate limiting (Phase D follow-up)

`lib/render-guard.server.ts` now uses Upstash whenever it is configured. Without it (local development) it falls back to memory.

- **Lock:** `SET hairpin:render:lock:<uid> 1 NX EX 180` allows one render in flight per person, across all instances. It is released when the render ends and expires on its own if an instance dies.
- **Counter:** `INCR hairpin:render:n:<uid>:<10-minute window>` with `EXPIRE`, allowing 12 renders per window and returning 429 with `Retry-After`.
- **Redis errors:** if Redis is configured but not answering, renders are refused (503) instead of running unguarded.
- **Not verified live:** none of this has been run against a real Upstash database in this work, only the memory fallback.

### Other Phase D follow-ups

- **"Stop waiting" is now "Continue browsing":** the request is not cancelled. It finishes in the background and the result appears in Saved, in the account that started it.
- **Loader:** RGB split, slice offsets, background stutter, ring flicker and grain are all toned down. It now pauses in hidden tabs. Reduced motion is still a still composition.
- **Publik reference generation:** remains experimental and disabled. No real OpenAI or publik render has been made, and transfer quality is unverified.

### Also fixed

- **Focus ring on programmatically focused headings:** the global `:focus-visible` rule is outside Tailwind's layers and overrode `outline-none`, drawing a ring on headings that receive focus from code (`tabindex="-1"`) even after mouse clicks.

### Testing

- `npm test`: 21 unit tests covering the try-on plan, Boards CRUD, multi-board looks, limits, sanitising tampered documents, merging and per-account keys.
- `scripts/e2e.cjs mock` and `unconnected` are updated for the new Saved.
- `scripts/e2e-accounts.cjs` runs two test users on one device. It covers the legacy prompt and adopt, board create/rename/duplicate/delete, a look in two boards, opening a saved look in Discover, a try-on, sign-out removing the own key, the second user seeing nothing of the first, restore from the server after wiping the device copy, and Delete all my data affecting only its own account.
- **Test-only sign-in (`lib/test-auth.ts`):** needed to run two accounts without real Google sign-in. It is active only in a development server started with `NEXT_PUBLIC_HAIRPIN_TEST_AUTH=1`.
  - A production build was checked: it ignores the test user (stays in device scope, creates no test database) and `/api/library` answers 401 to test tokens.
  - The strings remain in the production bundle as unreachable code.

### Not tested in Phase E

- Real Google sign-in with two accounts, and a real Upstash database for the library and the render guard.
- Cross-device sync between two real browsers. It was tested by wiping one browser's copy and restoring from the server.
- Safari private mode and storage-full conditions. These are handled with an error state, but not exercised.

## Own keys for more providers, and free try-ons (after Phase E, awaiting review)

### Providers (checked against each provider's docs on 2026-11-22; none run with a real key)

| Provider | Try-on | Decode / Briefs | Contract |
|---|---|---|---|
| OpenAI | Two images (selfie + portrait), verified from docs | Chat Completions | `POST /v1/images/edits`, `image[]` ×2, `gpt-image-2.6-sunburst` |
| Google Gemini | Two images, verified from docs ("Up to 14 reference images") | OpenAI-compatible chat, `gemini-3.8-flash`; JSON by prompt, as JSON mode isn't documented there | `POST /v1beta/interactions`, `Api-Revision: 2026-05-20`, `gemini-nano-banana-2.1`, `store: false` so Google keeps no copy (stored up to 55 days otherwise). The image is read from `steps[type=model_output].content[type=image].data` |
| OpenRouter | One image only. Reference matching is refused (409); the description works | `POST /api/v1/chat/completions`, `openrouter/auto` (unverified slug, `OPENROUTER_CHAT_MODEL` overrides) | `POST /api/v1/images` with `input_references`, `openai/gpt-image-2`, `provider.data_collection: "deny"`. Docs don't state reference counts or which reference is edited |
| Anthropic | Not possible: Claude doesn't make images. The studio says so; the planner and the last gate refuse (409 `provider_cannot_render`) | `@anthropic-ai/sdk` 1.12.0 (approved by the owner). `client.beta.messages.parse` on `claude-opus-5-5` (`ANTHROPIC_MODEL` overrides), effort `medium`. Structured outputs come from the route's own zod schema (`betaZodOutputFormat`). Server-side refusal fallbacks are on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). A refusal returns 422 `declined` | A fake-key probe confirmed the SDK reaches the API and maps 401. Request-body acceptance (fallbacks, output_config) is unverified until a real key is used |

- **How the choice is stored:** `{ mode: "own", vendor, key }`, per account on the device. Old saved choices without `vendor` are treated as OpenAI. Requests carry `x-hairpin-own-key` and `x-hairpin-own-vendor`.
- **Env overrides:** `OPENAI_IMAGE_MODEL`, `OPENAI_CHAT_MODEL`, `GEMINI_IMAGE_MODEL`, `GEMINI_CHAT_MODEL`, `OPENROUTER_IMAGE_MODEL`, `OPENROUTER_CHAT_MODEL`.
- **Unverified default:** `OPENAI_CHAT_MODEL` still defaults to `gpt-4o-mini`. Its availability in 2026 wasn't checked.

### Free try-ons (3 per IP)

- **Server env:**
  - `HAIRPIN_FREE_PROVIDER` (`openai` or `gemini`; only providers with verified two-image edits qualify).
  - `HAIRPIN_FREE_API_KEY`.
  - `HAIRPIN_FREE_DAILY_CAP` (default 50 per UTC day for the whole app).
  - `HAIRPIN_IP_SALT` (falls back to `PUBLIK_INSTALL_SECRET`).
  - Off unless these are set, and off in production without Upstash.
- **Gate:** people without a plan see "Start free trial or get a plan" (publik's 7-day trial) and "Try N free try-ons".
- **Scope:** free mode covers try-ons only. Decode and Briefs answer 403 `free_tryons_only`.
- **Counting:**
  - The key is `hairpin:free:ip:<sha256(salt:ip)>`, with a one-year TTL. The raw IP is never stored.
  - One try-on is reserved after every free refusal check and refunded if the provider fails.
  - The daily ceiling is `hairpin:free:day:<date>`.
  - Answers: 402 `free_used`, 429 `free_busy`, 503 `free_unavailable`.
- **IP source:** `x-vercel-forwarded-for`, then `x-real-ip`, then `x-forwarded-for`. Off Vercel, a proxy must overwrite these or clients can choose their IP.
- **Limitations:**
  - Per-IP limits are coarse. Shared networks (offices, campuses, carrier NAT) share three. VPNs and IP changes get more, with the daily ceiling as the backstop.
  - Free users still need Google sign-in and Sign in with publik, because the gate requires them.

### Tests

- `tests/free-tryons.test.mjs`: IP header precedence, salted hashes and the provider list.
- `scripts/e2e-providers.cjs` (demo mode):
  - Gemini reference matching, with headers checked.
  - OpenRouter blocked in the UI and refused by the server, with the description working.
  - A legacy OpenAI choice.
  - Free mode: three try-ons, then used up in the UI and 402 on the server, while another IP still has three.

## Phase F: integration, polish and release readiness (awaiting final review)

**Not production-ready.** Real Google sign-in, real Upstash and real AI renders have not been exercised in this
environment: there are no credentials here, and none were read from `.env` files.

### Changes in Phase F

- **Sync conflicts:** `lib/library-model.ts` is now v2.
  - Every add, rename and removal is timestamped, and removals leave tombstones.
  - Merging is deterministic: commutative and idempotent.
  - A stale device can't restore a removed look or a deleted board, and an edit after a deletion is kept.
  - "Delete all my data" leaves a content-free `resetAt` marker on the server, so an offline device can't push the old library back.
  - Tombstones are pruned after 180 days. v1 documents are upgraded.
  - The server always merges.
- **Distributed guards:** the render lock and limit and the free try-on counts were moved to `lib/guards.ts` over a small `Kv` interface (`lib/kv.ts`). They are tested against a fake Redis shared by two server instances. They fail closed.
- **Background generation, honestly:** measured with a delayed response.
  - The result is kept after in-app navigation, and lost on reload or closing the tab. The server never stores images, so nothing can be recovered, and the provider may still charge.
  - The studio copy now says so.
  - An app-wide pill shows "Making your try-on. Keep this tab open." and then "Try-on ready".
  - The browser asks for confirmation before leaving while a try-on runs.
  - There is no durable server-side job.
- **Production boundary for test sign-in:** the server now requires all of the following:
  - `NODE_ENV === "development"`;
  - the server-only `HAIRPIN_TEST_AUTH_SERVER=1`;
  - `NEXT_PUBLIC_HAIRPIN_TEST_AUTH=1`;
  - not running on Vercel.

  Checked results:
  - A production build started with both flags set answered 401 to test tokens on `/api/library` GET/PUT/DELETE and `/api/tryon`, and "signed_out" on `/api/publik/status`.
  - Its client ignored `hairpin.test-user`.
  - A dev server with only the public flag also answered 401.
- **Decode and Brief:**
  - Both prompts now forbid claims about who a cut suits or how it will turn out.
  - The brief editor and the exported image say they are AI-assisted and that lengths and suitability are the barber's call.
  - The brief editor has a real `<h1>`.
  - Its loading state uses the Hairpin loader.
- **Fixes found in QA:**
  - The "Try-on ready" pill covered the brief's Share button on phones after a try-on made in the studio. Such results no longer raise the pill.
  - End-to-end scripts now wait for hydration before picking files, so they don't flake on a cold dev server.
- **`components/landing/hero.tsx`:** removed only the unused `TRANSFORMS` import; the owner's removal of the hero card is preserved.

### Verified here (real code paths, no stand-ins)

- ESLint (0 problems), TypeScript, 37 unit tests and the production build.
- The production auth boundary described above.
- Responsive layout: 13 authenticated views × 5 widths (320/390/820/1440/1920), with no sideways scroll, no console errors, no unnamed controls, no images without alt text, and one `<h1>` per page.
- Keyboard focus rings on Saved, Discover, Try and You. Dialog focus is trapped, and Escape returns focus.
- Reduced motion: the loader goes still, with 0 running animations.
- Background generation behaviour (navigation vs. reload).
- The Anthropic SDK reaches the API and maps a 401 (fake key).
- Merge policy: commutativity, idempotence and the deletion conflict cases.

### Verified only with stand-ins (mocks, test identities, in-memory stores)

- **Sign-in:** two-account isolation, sign-out removing the own key, legacy adoption, and account-scoped deletion all used development test identities, not Google (`scripts/e2e-accounts.cjs`).
- **Sync:** two-browser sync, a stale browser, and delete-all against an offline browser (`scripts/e2e-sync.cjs`) ran against the dev server's in-memory library store, not Upstash.
- **Guards:** distributed render limits and free try-on counts ran against a fake Redis in unit tests, and memory in end-to-end runs.
- **Try-on:** every render was demo mode, an echo of the photo. That covers reference vs. description routing, provider headers, the OpenRouter and Anthropic refusals, and free try-ons.
- **Publik gate:** not exercised. Unconfigured builds skip it.

### Release blockers

1. Real Google sign-in with two accounts on one browser: switching, sign-out, legacy prompt, Delete all my data.
2. Upstash: library sync between two real browsers, the render lock and limit across instances, free try-on counts, and failure behaviour when Redis is down.
3. At least one real authenticated try-on per enabled provider, checking that the right portrait is sent and that the output is acceptable.
   - OpenAI and Gemini request formats are from docs only.
   - Unconfirmed model IDs: `OPENAI_CHAT_MODEL` defaults to `gpt-4o-mini`, and OpenRouter uses `openrouter/auto`.
   - publik reference matching stays off until the trial procedure (Phase D) passes.
4. Anthropic: a real Decode and Brief, confirming the API accepts `fallbacks: "default"` and `output_config.format`.
5. Privacy policy edits (per-account separation, saved looks and boards, providers, hashed IP counts) need owner or legal review.
6. Account deletion is by request. Deleting an account must remove `publik:user:<uid>` and `hairpin:library:<uid>` from Upstash; there is no self-serve flow.
7. The try-on route can run 20–60 s. Confirm the Vercel function duration limit for the plan, or set `maxDuration`.

### Accepted limitations (documented, not blockers)

- **Try-ons need the tab open** while they run. Results stay on the device and never on the server.
- **Sync uses device clocks:** a device far ahead in time wins ties. A device offline longer than 180 days can restore removed items.
- **Free try-ons per IP are coarse:** shared networks share three, and VPNs can get more, with the daily ceiling as the backstop. They rely on Vercel's IP headers.
- **npm warning:** `protobufjs` (via Firebase) has unrun install scripts (`npm approve-scripts`). Nothing currently depends on them.

### Validating with real accounts (owner)

1. **Two accounts:**
   - On a deployed preview with Firebase and Upstash configured, sign in with account A.
   - Save two looks, make a board, add a photo, and set an own key.
   - Sign out, then confirm the key setting is gone.
   - Sign in with account B and confirm nothing of A shows (Saved, Try photo, You, AI choice).
   - Sign back in as A and confirm everything returns.
2. **Legacy:** on a browser that used Hairpin before this branch, sign in and confirm the "Found older items" prompt shows counts only. Test both "add" and "delete".
3. **Two browsers:**
   - Sign in as A in two browsers and save a look in one; it appears in the other after focus or reload.
   - Take one offline, remove the look in the other, then bring the first back online: the look stays removed.
4. **Delete all my data** in one browser: the other browser's copy clears on its next sync. Check Upstash: `hairpin:library:<uid>` holds only `resetAt`.
5. **Limits:**
   - Start a try-on, then start another from a second tab: the second is refused with "already being made".
   - With `HAIRPIN_FREE_*` set, use 3 free try-ons from one network and confirm the 4th is refused.
6. **AI:**
   - One OpenAI reference try-on and one written-description try-on: compare the hair to the portrait, and check that face, skin and clothing are preserved.
   - Repeat with Gemini if enabled.
   - One Decode and one Brief with each enabled chat provider.

### Production deployment checklist

- **Required environment:**
  - Firebase: `NEXT_PUBLIC_FIREBASE_*`.
  - publik: `PUBLIK_APP_TOKEN`, `PUBLIK_INSTALL_SECRET`.
  - Upstash: `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or the `UPSTASH_*` pair.
- **Optional:** free try-ons (`HAIRPIN_FREE_PROVIDER`, `HAIRPIN_FREE_API_KEY`, `HAIRPIN_FREE_DAILY_CAP`, `HAIRPIN_IP_SALT`) and model overrides (`OPENAI_*_MODEL`, `GEMINI_*_MODEL`, `OPENROUTER_*_MODEL`, `ANTHROPIC_MODEL`).
- **Must NOT be set in production:** `PUBLIK_MOCK`, `NEXT_PUBLIC_HAIRPIN_TEST_AUTH`, `HAIRPIN_TEST_AUTH_SERVER`, `NEXT_PUBLIC_PUBLIK_REFERENCE_TRIAL`. Remove `OPENAI_IMAGE_MODEL=gpt-image-1` if present.
- **Firebase Auth:** add the production domain to authorized domains.
- **Vercel:** confirm the function duration for `/api/tryon`. Confirm the build includes the catalog portraits (they are traced via `outputFileTracingIncludes`).
- **Before launch:** run `npm test`, `npx eslint`, `npx tsc --noEmit` and `next build`, then the real-account validation above on a preview deployment.
- **Review:** have the privacy policy and terms reviewed.

## Phase F follow-up: clocks, account deletion, cost allowance, Firebase check

### Sync ordering

- **Server-ordered timestamps:**
  - The server clamps every incoming timestamp to its own time (`clampLibrary`).
  - Every `/api/library` answer carries `serverTime`.
  - Devices stamp edits with `Date.now()` plus the offset they learnt (midpoint of the round trip), kept per device in `hairpin:clock-offset`.
  - A device with a fast clock can't override a newer change.
- **Remaining error:** about half a round trip. A device offline since its last sync uses its last known offset.
- **Board deletion (unit-tested):** deleting a board removes its memberships; its looks stay saved and stay in other boards.

### Account deletion: completion process

1. **In-app:** You > Delete my account > confirm.
2. **Server (`DELETE /api/account`), using only the token's uid:**
   - Replaces `hairpin:library:<uid>` with a content-free reset marker that expires after 2 h. ID tokens live 1 h, so a stale device can't re-create it.
   - Deletes `publik:user:<uid>`.
   - Deletes the render lock and the current window, day and month counters. Older counters expire on their own.
   - If any step fails, it answers 503 and the person retries; every step is idempotent.
3. **Device:** clears this account's IndexedDB stores and its `@<uid>` localStorage keys.
4. **Firebase:** deletes the Auth user, re-authenticating with Google first if Firebase answers `auth/requires-recent-login`. If that fails, the person is told their Hairpin data is gone and to retry to remove the sign-in.
5. **Not deleted, because it isn't per account:**
   - free try-on counts (salted IP hash, 1 year);
   - app-wide daily and monthly free totals;
   - the person's publik account and install, which publik manages; there is no documented revoke API;
   - provider-side logs.
6. **Requests by email** (privacy policy contact) follow the same steps manually:
   - delete the Firebase Auth user in the console;
   - `DEL hairpin:library:<uid>` and `publik:user:<uid>` in Upstash;
   - reply to confirm, within 30 days.
7. **Tested:** with a test identity in `scripts/e2e-accounts.cjs` (server library gone, device keys gone, signed out). Not tested with a real Google account.

### Cost controls

- **Per account:** a daily and monthly try-on allowance, whoever pays: `HAIRPIN_DAILY_TRYONS` (default 30) and `HAIRPIN_MONTHLY_TRYONS` (default 300).
  - Reserved before the provider call and refunded on failure.
  - Shared across instances through Upstash. Fails closed.
  - Waiting out the 10-minute burst window doesn't reset it.
- **Free try-ons:** also capped by `HAIRPIN_FREE_MONTHLY_CAP` (default 1000 for the whole app), on top of the daily cap.
- **Provider budgets:** set them on the app's own free-try-on key (an OpenAI project budget or limit, or a Google Cloud billing budget with alerts for Gemini). Hairpin can't enforce a provider's billing.

### Generation lifecycle

- **The studio's own warning** stays visible during every try-on ("keep this tab open, as reloading or closing it stops the try-on").
- **The browser's leave dialog** is a backup only; mobile browsers may not show it.

### Firebase (checked with the signed-in Firebase CLI, read-only)

- **Project:** `hairpin` (`hairpin-dab4f`) has one web app, `1:936712411084:web:b5b2031a5877d5bd8eef69`.
- **Running app:** the dev server on :3000 serves this project's config (`hairpin-dab4f`, `hairpin-dab4f.firebaseapp.com`).
- **Firestore:** no database exists. That's consistent with the design: sync uses Upstash, and Firestore isn't used.
- **Not checkable from the CLI, check in the console:**
  - Authentication > Sign-in method: Google enabled.
  - Authorized domains: the production domain added.
  - Settings: email enumeration protection.
- **User data:** no user data was read or exported.

## Face shape, "Show me", the feed, Decode history and community cuts (awaiting review)

Nothing here is committed. Everything below was built and checked in a scratch copy of the repo (no `.env`, no real keys).

### What changed
- **Loader.** The lower gold bloom moved to the corner (`.hl-bloom--2`) and the wordmark and status line now stack above blooms, so the status text is never covered.
- **Look model v2** (`lib/looks.ts`, `lib/style.ts`): audience, controlled style tags, face shapes, source (`curated` / `mine` / `community`), createdAt, blur placeholder, saves, owner key. IDs: curated slug, `m-<uuid>` (private, on device), `p-<12 hex>` (community). Saved/board sync keeps `m-` and `p-` ids; one that can't be resolved shows "No longer available" with a remove button, never silently dropped.
- **Curated library pipeline.** `npm run looks` reads `content/curated-looks.json` and `content/looks-src/placeholder_N.png`, validates against the shared vocabulary, writes 960 px WebP to `public/assets/looks/` and `content/looks.generated.json`. 16 placeholder looks are in. Replace the PNGs, edit the text, rerun. `scripts/import-photos.mjs` was removed: it wrote to `public/gallery`, which try-on could not read (`/assets/looks/` is now an allowed reference folder).
- **Feed** (`lib/feed.ts`, `lib/taste.ts`, `components/masonry.tsx`): explainable ranker (hair type, taste, recency, face shape, "Show me", popularity, length, seen/saved penalties), diversity re-rank and one exploration slot in six, tabs For you / New / Popular / Mine / Saved, "More like this", "Not for me" with undo, "Why you're seeing this", column-balanced masonry, paging. Taste, seen and hidden stay on the device and are cleared by "Reset recommendations" and "Delete all my data".
- **"Show me" (Men's / Women's / Both).** In onboarding, You and Discover. A change that alters the feed shows the loading screen while the new top 12 images load (at least 0.6 s, at most 1.8 s, tap or Escape to skip, none under reduced motion).
- **Face scan** (`lib/face-shape.ts`, `lib/face-detect.ts`, `components/face/face-scan.tsx`): MediaPipe runs on the device, with the model and WASM served from `/mediapipe/` (one-year immutable cache), loaded only after the person taps scan. It draws the outline and four measurements on the photo, suggests a shape, and the person confirms or changes it. Only the shape and whether it was picked or suggested are saved. Guide wording is positive only ("A starting point, not a rule").
- **Decode**: always opens clean; the last 12 decodes are kept on the device (Recent rail, reopen without an AI call, "Use my last photo", "Decode again", per-item delete, "Clear history").
- **My cuts**: one image pipeline (`lib/image-pipeline.ts`: orientation applied, 960 px, WebP with JPEG fallback, about 120 KB, metadata removed) used inside the upload loading screen. Cuts are stored in IndexedDB (v2 adds `decode` and `cuts`), appear in Discover > Mine, Saved and Try (as an upload reference, nothing sent by id).
- **Community cuts**: share publicly after review. Server re-encodes with sharp, stores one copy in Vercel Blob, details in Upstash. Nothing is visible until approved (`/admin/posts`, `HAIRPIN_ADMIN_UIDS`). Reports (three distinct reporters auto-hold), owner delete, daily upload cap 5, 30 live posts per person, soft stop at 800 MB of stored images. Account deletion and "Delete all my data" remove everything shared. Try-on resolves approved `p-` looks on the server from our own record (host allow-listed, size capped).
- **Legal**: privacy policy and terms now describe on-device face scan, recommendations, public sharing, what is kept for save and report counts, and an explicit opt-in display licence shown at the share checkbox.

### Verified here
- `npm test`: 78 unit tests (feed, taste, face shape on 20 real MediaPipe landmark fixtures, guide wording, posts model and repository with caps, approve-first, reports, deletion, byte accounting, ids and saved-library sanitising, image pipeline helpers), plus the existing suites.
- ESLint and `tsc` clean; `next build` succeeds (scratch copy, no env).
- Real Chromium, real MediaPipe: scan of a project portrait draws the overlay and saves a shape.
- E2E: `e2e.cjs mock`, `e2e-providers.cjs`, `e2e-accounts.cjs`, `e2e-sync.cjs` pass. New `e2e-community.cjs` (share, pending, admin approve, visible, three reports hold it, re-approve, owner delete, image gone, per-account isolation of private cuts) passes against the in-memory Blob and Redis fallbacks.
- No horizontal overflow at 320 / 390 / 820 / 1440 / 1920 on Discover, Decode, You, Saved, Welcome and the admin page; add-a-cut sheet fits at each width.

### Not verified (needs the owner)
- **Real Vercel Blob and Upstash** behaviour for the new keys and sorted sets, and Blob transfer limits at scale (check the plan's current limits before launch).
- **Face-shape accuracy.** The thresholds in `lib/face-shape.ts` are provisional priors, not fitted to labelled data. The 20 project portraits are front-facing AI faces with very similar proportions (length/width 1.16 to 1.23), so they prove the plumbing and invariances (roll, scale, rejection cases), not accuracy across real faces, glasses, hair over the forehead or angles. The UI always lets the person override.
- MediaPipe speed on low-end phones; first scan downloads about 18 MB once.
- Real Google sign-in, and the review queue under real moderation load. The owner has to actually review `/admin/posts`.
- The legal text is a plain-language draft and has had no legal review.

### Known limitations
- If a person saved or reported someone else's cut, their account ID stays in that cut's counts until the cut is removed (disclosed in the privacy policy).
- Saves are counted toward popularity only when made from Discover, not from Saved.
- Community feed pages append as you scroll, so already-loaded cuts can shift slightly when a new page arrives.

### Real-account checklist
1. Set `BLOB_READ_WRITE_TOKEN` and `HAIRPIN_ADMIN_UIDS` (your own uid) in Vercel; redeploy.
2. Share a cut from one account; confirm it is invisible to a second account, then approve it at `/admin/posts` and confirm it appears and the image loads from a `*.public.blob.vercel-storage.com` URL.
3. Report it from three accounts; confirm it disappears and returns to the queue as Held.
4. Delete it as the owner; confirm the Blob object is gone.
5. Run "Scan my face" on a real phone and on a photo with glasses and with hair over the forehead; confirm the result is only a suggestion you can change.
6. Try on a community look with a real provider key.
