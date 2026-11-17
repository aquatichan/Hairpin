# Hairpin

Try any cut on you before you sit in the chair.

Next.js (App Router) + TypeScript + Tailwind v4, Firebase Auth and Storage, and the Publik API for all text and image generation.

## Run

```bash
npm install
cp .env.example .env.local   # fill in values; never commit this file
npm run dev
```

Without Firebase env values the app runs in preview mode: sign-in is disabled and the gallery is open.

## Design rules

All colors, type sizes, radii and fonts are tokens in `app/globals.css`. Tailwind's default scales are reset there, so only the tokens exist. Dark mode only. Crimson is the single accent.

## Structure

- `app/page.tsx`: sign-in hero (3D head in `components/head`)
- `app/(app)`: signed-in shell with Discover, Try, Saved, You
- `lib/publik.ts`: the only server-side door to the Publik API
- `scripts/render-looks.cjs`: re-renders the preview catalog stills
