// Admin time handling for announcements. Times are entered and shown in US Central time and stored as UTC ISO
// strings. Client-safe (Intl only), so the panel and the server convert identically, including across DST.

export const ADMIN_TIME_ZONE = "America/Chicago";
export const ADMIN_TIME_ZONE_LABEL = "US Central time (America/Chicago)";

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function centralParts(utcMs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(new Date(utcMs))) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}

// Central's offset from UTC at an instant, in minutes (-360 in CST, -300 in CDT).
function centralOffsetMinutes(utcMs: number): number {
  const p = centralParts(utcMs);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs) / 60000;
}

// "2026-11-08T14:30" (Central wall time, as a datetime-local input gives it) → UTC ISO, or null if not a real date.
export function centralLocalToUtcIso(local: string): string | null {
  const m = LOCAL_PATTERN.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  // Two passes settle the offset on either side of a DST change.
  let utc = wall - centralOffsetMinutes(wall) * 60000;
  utc = wall - centralOffsetMinutes(utc) * 60000;
  return new Date(utc).toISOString();
}

// UTC ISO → "2026-11-08T14:30" in Central, for a datetime-local input.
export function utcIsoToCentralLocal(iso: string): string {
  const p = centralParts(Date.parse(iso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const displayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

// UTC ISO → "Nov 8, 2026, 2:30 PM CST".
export function formatCentral(iso: string | null): string {
  return iso ? displayFormatter.format(new Date(iso)) : "—";
}
