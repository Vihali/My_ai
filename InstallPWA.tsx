"use client";

import { useEffect, useState } from "react";
import { IconArrowRight } from "@/components/icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPWA() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
    } else {
      setShowGuide((v) => !v);
    }
  };

  if (installed) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-sage-500/40 bg-sage-500/10 px-4 py-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sage-500" />
        <p className="text-[13px] text-mist-100">
          <strong>Vishal.AI is installed</strong> — launch it from your home screen any time.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[18px]" aria-hidden>
          📱
        </span>
        <p className="min-w-0 flex-1 text-[13px] text-mist-300">
          <strong className="text-mist-100">Get the Android app</strong> — install Vishal.AI on
          your phone with its own icon, full-screen, like a native app.
        </p>
        <button
          onClick={install}
          className="flex items-center gap-1.5 rounded-lg bg-ember-500 px-3.5 py-2 text-[12.5px] font-semibold text-ink-950 transition-colors hover:bg-ember-400"
        >
          Install on Android
          <IconArrowRight size={13} />
        </button>
      </div>
      {showGuide && (
        <div className="anim-rise mt-3 rounded-lg border border-ink-700 bg-ink-850/80 px-4 py-3 text-[12.5px] leading-relaxed text-mist-300">
          <strong className="text-mist-100">In Chrome on your phone:</strong> open this page →
          tap the <strong>⋮ menu</strong> → <strong>“Install app”</strong> (or “Add to Home
          screen”). That's it — the icon appears on your home screen.
          <br />
          <span className="text-mist-500">
            Want a signed Play-Store-style APK instead? Once this app is deployed to a permanent
            URL, paste that URL into <strong>pwabuilder.com</strong> → download the Android
            package. See DEPLOY.md.
          </span>
        </div>
      )}
    </div>
  );
}
