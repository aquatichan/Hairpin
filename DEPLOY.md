# Deploying Hairpin to Vercel

The app builds and runs with no environment variables at all: anything unset (or still a `PLACEHOLDER_[...]` string) stays switched off and the UI says so. You can deploy first and add keys later.

## 1. Connect the repo (about 3 minutes)

1. Go to https://vercel.com/new and sign in with GitHub as the account that owns `aquatichan/hairpin`.
2. If the repo is not listed, choose "Adjust GitHub App Permissions" and give Vercel access to `hairpin` only.
3. Import `hairpin`. Leave every build setting on its default (framework Next.js, root `./`). Press Deploy.
4. Vercel gives you a URL such as `hairpin-xxxx.vercel.app`. Every push to `main` redeploys it; every pull request gets its own preview URL.

## 2. Add the keys

Project, then Settings, then Environment Variables. Paste each value there, never into chat or the repo. Tick Production and Preview.

| Name | Needed for | Where the value comes from |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Google sign-in | Firebase console, Project settings, Your apps, Web app config (`apiKey`) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Google sign-in | same config (`authDomain`, ends in `.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Google sign-in, and the server checking who is calling | same config (`projectId`) |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | not used yet | same config (`storageBucket`) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | not used yet | same config (`appId`) |
| `PUBLIK_API_KEY` | try-on renders, Decode, Barber Brief | Publik dashboard. Mark it Sensitive. |
| `AI_FALLBACK` and `OPENAI_API_KEY` | optional fallback | set `AI_FALLBACK=openai` only if you want it; that spend does not count toward the score |

Do not set `PUBLIK_MOCK`. `PUBLIK_API_BASE_URL`, `PUBLIK_APP_TOKEN` and `NEXT_PUBLIC_PUBLIK_APP_SLUG` are not needed yet.

After adding or changing any variable, open Deployments, pick the latest one, and choose Redeploy. The `NEXT_PUBLIC_` values are baked in at build time, so they do nothing until a redeploy.

## 3. Let Google sign-in work on the Vercel domain

In the Firebase console:

1. Authentication, Sign-in method: enable Google.
2. Authentication, Settings, Authorized domains: add your production domain (`hairpin-xxxx.vercel.app`, and any custom domain). Without this, the sign-in popup fails with `auth/unauthorized-domain`.

Preview URLs change with every pull request and are not authorized, so sign-in only works on the production domain.

## Limits worth knowing

- Vercel's free Hobby plan is for non-commercial use. If Hairpin itself starts charging people, move to Pro.
- A request or response through a function is capped at 4.5 MB. Photos are shrunk in the browser well below that, and renders are streamed back.
- Functions may run up to 300 seconds on Hobby, which covers a slow image render.
