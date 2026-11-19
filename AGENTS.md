<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## publik API
- Base URL: https://publikhq.com/api/v1 (OpenAI Chat Completions, Responses, Anthropic Messages)
- Models: publik-fast, publik-balanced, publik-smart or a vendor/model name from GET /models; never a bare model name
- Sign in with publik: after Google sign-in, `components/publik-gate.tsx` (client) and `lib/publik-gate.ts` (server, `requireMember` in every AI route) gate the app on `lib/publik.server.ts` (publik's hosted-web module, kept as published); it also sends usage telemetry
- Key: one `pk_` per person from POST /installs, made by `ensureUser(firebaseUid)` and kept server-side in Upstash Redis (`KV_REST_API_URL` / `KV_REST_API_TOKEN`); never sent to the browser. "Use my own key" sends the person's OpenAI key per request (`x-hairpin-own-key`), never stored server-side
- App token: PUBLIK_APP_TOKEN plus PUBLIK_INSTALL_SECRET, server env only (Vercel), never committed
- 402: show error.message + error.top_up_url only
- Show use: GET /wallet used_percent or prepaid_remaining_percent, never money
- Never print or log a key
- Docs: https://publikhq.com/llms.txt, https://publikhq.com/developers, https://publikhq.com/skills/api.md
