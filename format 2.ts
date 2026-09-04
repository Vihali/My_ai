export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export const PRIORITY_META: Record<
  string,
  { label: string; className: string }
> = {
  high: { label: "High", className: "text-danger-500 border-danger-500/40 bg-danger-500/10" },
  medium: { label: "Medium", className: "text-ember-400 border-ember-500/40 bg-ember-500/10" },
  low: { label: "Low", className: "text-mist-500 border-ink-500 bg-ink-800" },
};
