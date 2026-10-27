export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function until(ts: number): string {
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const hours = Math.max(1, Math.round(abs / 3_600_000));
  if (hours < 48) return diff >= 0 ? `${hours}h left` : `${hours}h overdue`;
  const days = Math.round(hours / 24);
  return diff >= 0 ? `${days}d left` : `${days}d overdue`;
}

export function shortHash(hash: string, length = 10): string {
  if (!hash) return "—";
  return `${hash.slice(0, length)}…${hash.slice(-4)}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
