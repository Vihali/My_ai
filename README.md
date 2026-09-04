# Vishal.AI — Unified Personal Life Agent

One companion, one conversation, many capabilities: knowledge Q&A (via your
LLM key), persistent memory, tasks, math, planning, games & websites that run
in-chat, pocket tools, English + বাংলা, and a built-in safety policy.

## ⚠️ Why sandbox URLs die (and the permanent fix)

Preview URLs like `https://3000-xxxx.e2b.app` are **temporary sandboxes** —
they are deleted when the session ends, which is why wrapped apps show
*"sandbox wasn't found"*. This is by design and cannot be prevented in code.

**The permanent fix is a one-time, free deploy (~5 minutes):**

### Vercel + Neon (recommended)

1. Upload this project to a GitHub repository.
2. Create a free database at **neon.tech** → copy the connection string.
3. Go to **vercel.com/new** → import your repo (framework auto-detected).
4. Add one environment variable: `DATABASE_URL` = your Neon connection string.
5. Click **Deploy**. Your `https://your-app.vercel.app` URL never expires.
6. Open it → **Settings** → paste your LLM key (NVIDIA/OpenAI/Gemini/etc.).

### Any host works

Render, Railway, Fly.io, a VPS — anything that runs Node.js 20+ and gives you
a PostgreSQL URL. The database **creates its own tables on first boot**
(`ensureSchema`), so there are no migration steps anywhere.

## Android app (APK)

- **Instant:** open the permanent URL in Chrome → ⋮ → *Install app* (full PWA).
- **Signed APK/AAB:** paste the permanent URL into **pwabuilder.com** →
  *Package For Stores → Android*.
- Never wrap a sandbox URL — it will expire.

## Features

- 🧠 Connectable brain: NVIDIA NIM, OpenAI, Anthropic, Gemini, Qwen, or any
  OpenAI-compatible endpoint (with retries + automatic overload fallback)
- 🎮 Artifacts: ask *"make me a snake game"* — it builds and runs in-chat,
  with fullscreen and `.html` download
- 🧰 Pocket tools: passwords, dice, coin flips, UUIDs, date math
- 🗂️ Tasks board · 🧠 editable long-term memory (search by topic)
- 🇧🇩 Bangla conversation layer · 💛 safety policy (sexual content declined)
- 🧮 Exact local math engine with shown work (never hallucinated arithmetic)
