# Deploying Vishal.AI permanently (and turning it into an app)

The `*.e2b.app` preview URL is a **temporary sandbox** — it disappears when the
session ends, which is why wrapped apps show *"sandbox wasn't found"*.
Deploy to a permanent host instead. The project is already prepared:

- ✅ Database tables **auto-create on first boot** (`ensureSchema`) — you only need `DATABASE_URL`.
- ✅ **PWA-ready** — installable from the browser as a native-like app.

## Option A — Vercel + Neon (easiest, free tiers)

1. Push this project to a GitHub repository.
2. Create a free database at [neon.tech](https://neon.tech) → copy the **connection string**.
3. Import the repo at [vercel.com/new](https://vercel.com/new) (framework: Next.js).
4. Add environment variable: `DATABASE_URL` = your Neon connection string.
5. Deploy. Open your `*.vercel.app` URL → **Settings** → paste your Gemini key again.

## Option B — Render (free web service + free Postgres)

1. New → PostgreSQL (copy *Internal Database URL*).
2. New → Web Service from the same repo, build `npm run build`, start `npm start`.
3. Env var: `DATABASE_URL` = the Postgres URL. Deploy.

## Making it an app (APK)

The project ships as a full PWA (manifest + service worker + icons), so:

**Zero-code install (any Android phone):**
open the permanent URL in Chrome → ⋮ menu → **Install app**. Vishal.AI installs
with its logo, runs full-screen, behaves like a native app.

**Signed APK / AAB (for Play Store or direct download):**

- **PWABuilder (no code):** go to [pwabuilder.com](https://www.pwabuilder.com),
  paste your permanent URL, click *Package For Stores → Android* → download the
  signed package. Takes ~2 minutes.
- **Capacitor (full control):**
  ```bash
  npm i @capacitor/core @capacitor/cli @capacitor/android
  npx cap init "Vishal.AI" "com.vishal.ai" --web-dir .next/static  # or export static
  npx cap add android && npx cap sync
  # then: android/ → open in Android Studio → Build APK
  ```
  Point the WebView at your permanent URL.

⚠️ **Never wrap the temporary `*.e2b.app` preview URL** — it expires and causes
"sandbox wasn't found". Only package permanent deployments.

## Notes

- Your Gemini/OpenAI/Anthropic/Qwen key lives in the **settings table** of the
  new database — add it once in Settings after deploying.
- Works with any PostgreSQL 13+ (Neon, Supabase, Render, RDS, Aiven…).
