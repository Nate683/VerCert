import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import {
  announcementState,
  claimsBanner,
  periodsOverlap,
  type Announcement,
  type AnnouncementAudience,
  type AnnouncementStatus,
  type BannerAnnouncement,
} from "./rules";

// Server-only Postgres store for the announcement banners (table created by scripts/announcements.mjs).

type AnnouncementRow = {
  id: string;
  audience: AnnouncementAudience;
  title: string;
  highlight: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  status: AnnouncementStatus;
  starts_at: string | null;
  ends_at: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

function rowToAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    audience: row.audience,
    title: row.title,
    highlight: row.highlight,
    body: row.body,
    linkUrl: row.link_url,
    linkLabel: row.link_label,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export type AnnouncementInput = Omit<Announcement, "id" | "createdAt" | "updatedAt" | "updatedBy">;

export async function listAnnouncements(): Promise<Announcement[]> {
  const rows = await query<AnnouncementRow>("SELECT * FROM announcements ORDER BY created_at DESC, id ASC");
  return rows.map(rowToAnnouncement);
}

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  const rows = await query<AnnouncementRow>("SELECT * FROM announcements WHERE id = $1", [id]);
  return rows[0] ? rowToAnnouncement(rows[0]) : null;
}

export async function createAnnouncement(input: AnnouncementInput, actorEmail: string): Promise<Announcement> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO announcements
       (id, title, highlight, body, link_url, link_label, status, starts_at, ends_at, enabled, created_at, updated_at, updated_by, audience)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13)`,
    [id, input.title, input.highlight, input.body, input.linkUrl, input.linkLabel, input.status, input.startsAt, input.endsAt, input.enabled, now, actorEmail, input.audience]
  );
  return (await getAnnouncement(id))!;
}

export async function updateAnnouncement(id: string, input: AnnouncementInput, actorEmail: string): Promise<Announcement | null> {
  await query(
    `UPDATE announcements
        SET title = $2, highlight = $3, body = $4, link_url = $5, link_label = $6, status = $7,
            starts_at = $8, ends_at = $9, enabled = $10, updated_at = $11, updated_by = $12, audience = $13
      WHERE id = $1`,
    [id, input.title, input.highlight, input.body, input.linkUrl, input.linkLabel, input.status, input.startsAt, input.endsAt, input.enabled, new Date().toISOString(), actorEmail, input.audience]
  );
  return getAnnouncement(id);
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("DELETE FROM announcements WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}

// Another record of the same audience whose claim on the banner overlaps this one's, or null. Only one
// announcement per audience may be live or scheduled for any period, so a save that would overlap is refused (the
// caller names the conflict). Logged-in and logged-out announcements never conflict with each other.
export async function findConflictingAnnouncement(
  candidate: Pick<Announcement, "audience" | "status" | "enabled" | "startsAt" | "endsAt">,
  excludeId: string | null,
  nowIso: string
): Promise<Announcement | null> {
  if (!claimsBanner(candidate, nowIso)) return null;
  const others = (await listAnnouncements()).filter(
    (a) => a.id !== excludeId && a.audience === candidate.audience && claimsBanner(a, nowIso)
  );
  return others.find((a) => periodsOverlap(a, candidate)) ?? null;
}

// The announcement an audience sees right now (server time), or null for no bar. Overlaps are refused on save, so
// at most one per audience is live; should two ever be, the most recently started (then most recently created)
// wins, deterministically. Never throws: if the table is missing or the database errors, there is simply no bar.
export async function getLiveAnnouncement(audience: AnnouncementAudience, now = new Date()): Promise<BannerAnnouncement | null> {
  try {
    const nowIso = now.toISOString();
    const rows = await query<AnnouncementRow>(
      `SELECT * FROM announcements
        WHERE audience = $2 AND enabled = TRUE AND status IN ('active', 'scheduled')
          AND (starts_at IS NULL OR starts_at <= $1)
          AND (ends_at IS NULL OR ends_at > $1)
        ORDER BY starts_at DESC NULLS LAST, created_at DESC, id ASC`,
      [nowIso, audience]
    );
    const live = rows.map(rowToAnnouncement).find((a) => announcementState(a, nowIso) === "live");
    return live ? { highlight: live.highlight, body: live.body, linkUrl: live.linkUrl, linkLabel: live.linkLabel } : null;
  } catch (err) {
    console.error(`[announcements] could not load the ${audience} announcement:`, err);
    return null;
  }
}
