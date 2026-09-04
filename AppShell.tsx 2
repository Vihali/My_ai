"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconChat,
  IconGear,
  IconGrid,
  IconMemory,
  IconTasks,
  LogoMark,
} from "@/components/icons";

const NAV = [
  { href: "/", label: "Command Deck", icon: IconGrid },
  { href: "/chat", label: "Console", icon: IconChat },
  { href: "/tasks", label: "Tasks", icon: IconTasks },
  { href: "/memory", label: "Memory", icon: IconMemory },
  { href: "/settings", label: "Settings", icon: IconGear },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-ink-700/70 bg-ink-900/60 max-md:hidden">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <span className="text-ember-500">
            <LogoMark size={24} />
          </span>
          <div className="leading-none">
            <div className="font-display text-[15px] font-semibold tracking-tight text-mist-100">
              Vishal<span className="text-ember-500">.AI</span>
            </div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-mist-500">
              Personal OS
            </div>
          </div>
        </div>
        <nav className="mt-2 flex flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-ember-500/12 text-ember-300"
                    : "text-mist-500 hover:bg-ink-800 hover:text-mist-300"
                }`}
              >
                <Icon size={16} className={active ? "text-ember-500" : "text-mist-500 group-hover:text-mist-300"} />
                {item.label}
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ember-500" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-5 pb-5">
          <div className="rounded-lg border border-ink-700 bg-ink-850 p-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-sage-500" />
              </span>
              <span className="text-[11px] font-semibold text-mist-300">
                One mind · many capabilities
              </span>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-mist-500">
              Warm &amp; honest, never fabricates · memory &amp; tasks persisted
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-4 border-b border-ink-700/70 bg-ink-900/80 px-4 py-2.5 md:hidden">
          <span className="text-ember-500">
            <LogoMark size={20} />
          </span>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`rounded-md p-2 ${
                    active ? "bg-ember-500/12 text-ember-400" : "text-mist-500"
                  }`}
                >
                  <Icon size={17} />
                </Link>
              );
            })}
          </nav>
          <span className="ml-auto font-display text-sm font-semibold">
            Vishal<span className="text-ember-500">.AI</span>
          </span>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
