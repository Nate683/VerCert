// Logged-in announcement banner: the record shape and the display rules. Client-safe (no database access), so the
// /command panel and the server agree exactly on what is live.
//
// These announcements are shown to signed-in customers only, in the navy bar under the ticker. The signed-out
// "Ordering opens soon" notice is separate (lib/prelaunch.ts) and is not managed here.

export const ANNOUNCEMENT_STATUSES = ["draft", "active", "scheduled", "expired"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: "Draft",
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
};

export type Announcement = {
  id: string;
  title: string; // internal only, never shown to customers
  highlight: string; // the gold leading phrase
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  status: AnnouncementStatus;
  startsAt: string | null; // ISO 8601, UTC
  endsAt: string | null; // ISO 8601, UTC
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

// What a signed-in customer's banner shows. Rendered as text (React escapes it); never as HTML.
export type MemberAnnouncement = Pick<Announcement, "highlight" | "body" | "linkUrl" | "linkLabel">;

// Where a record stands right now, by server time.
export type AnnouncementState = "draft" | "disabled" | "expired" | "scheduled" | "live";

export const ANNOUNCEMENT_STATE_LABELS: Record<AnnouncementState, string> = {
  draft: "Draft",
  disabled: "Disabled",
  expired: "Expired",
  scheduled: "Scheduled",
  live: "Live",
};

// Draft, expired (by status or by its end time) and disabled records never show. An active or scheduled record
// shows from its start time (none = immediately) until its end time (none = indefinitely). So a scheduled record
// goes live by itself at its start, and any record stops by itself at its end.
export function announcementState(a: Announcement, nowIso: string): AnnouncementState {
  if (a.status === "draft") return "draft";
  if (!a.enabled) return "disabled";
  if (a.status === "expired" || (a.endsAt !== null && a.endsAt <= nowIso)) return "expired";
  if (a.startsAt !== null && a.startsAt > nowIso) return "scheduled";
  return "live";
}

// Records that hold a claim on the banner, now or later: enabled, active or scheduled, not yet ended.
// No two of these may overlap in time (enforced on save).
export function claimsBanner(a: Pick<Announcement, "status" | "enabled" | "endsAt">, nowIso: string): boolean {
  return a.enabled && (a.status === "active" || a.status === "scheduled") && !(a.endsAt !== null && a.endsAt <= nowIso);
}

export function periodsOverlap(
  a: Pick<Announcement, "startsAt" | "endsAt">,
  b: Pick<Announcement, "startsAt" | "endsAt">
): boolean {
  // Missing start = since forever; missing end = forever. ISO UTC strings compare correctly as text.
  const aStart = a.startsAt ?? "", aEnd = a.endsAt ?? "￿";
  const bStart = b.startsAt ?? "", bEnd = b.endsAt ?? "￿";
  return aStart < bEnd && bStart < aEnd;
}

// Optional link: a page on this site ("/shop", not "//host") or an http(s) URL. Anything else — javascript:,
// data:, mailto:, protocol-relative, backslashes, whitespace or control characters — is refused.
export function isSafeAnnouncementLink(raw: string): boolean {
  if (raw.length === 0 || raw.length > 500 || /[\s\u0000-\u001F\u007F\\]/.test(raw)) return false;
  if (raw.startsWith("/")) return !raw.startsWith("//");
  try {
    const url = new URL(raw);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function isInternalAnnouncementLink(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}
