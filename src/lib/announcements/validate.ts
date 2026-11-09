import { z } from "zod";
import { findBlockedTerm, blockedTermMessage } from "@/lib/content-guard";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_STATUSES,
  announcementPlainText,
  isSafeAnnouncementLink,
  parseAnnouncementText,
  type Announcement,
} from "./rules";
import { centralLocalToUtcIso, utcIsoToCentralLocal } from "./time";
import type { AnnouncementInput } from "./store";

// Validation for the /command announcement editor. Server-only (used by the API routes); the panel only mirrors it.
//
// Dates arrive as Central wall time ("2026-11-08T14:30", from datetime-local inputs) and are stored as UTC.
// Text is collapsed to single spaces and trimmed; control characters can't survive that. It is stored and rendered
// as plain text (React escapes it), so markup typed into a field shows literally and never runs.

const text = (max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`));

const optionalText = (max: number, label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "") || null)
    .refine((s) => s === null || s.length <= max, `${label} must be ${max} characters or fewer.`);

const centralLocal = z
  .union([z.string(), z.null()])
  .optional()
  .transform((s) => (typeof s === "string" && s.trim() ? s.trim() : null));

export const announcementFieldsSchema = z.object({
  audience: z.enum(ANNOUNCEMENT_AUDIENCES, { error: "Choose who sees it: logged-in customers or logged-out visitors." }),
  title: text(120, "Internal title"),
  highlight: text(60, "Gold-highlighted text"),
  body: text(240, "Main announcement text"),
  linkUrl: optionalText(500, "Link URL"),
  linkLabel: optionalText(40, "Link label"),
  status: z.enum(ANNOUNCEMENT_STATUSES, { error: "Choose a status: Draft, Active, Scheduled or Expired." }),
  startsAt: centralLocal,
  endsAt: centralLocal,
  enabled: z.boolean({ error: "Enabled must be on or off." }),
});

// The editor's view of a stored record: dates back in Central wall time.
export function toEditorFields(a: Announcement) {
  return {
    audience: a.audience,
    title: a.title,
    highlight: a.highlight,
    body: a.body,
    linkUrl: a.linkUrl,
    linkLabel: a.linkLabel,
    status: a.status,
    startsAt: a.startsAt ? utcIsoToCentralLocal(a.startsAt) : null,
    endsAt: a.endsAt ? utcIsoToCentralLocal(a.endsAt) : null,
    enabled: a.enabled,
  };
}

export type ValidationResult = { ok: true; value: AnnouncementInput } | { ok: false; error: string };

// Full validation of a complete record (a create, or an update merged onto the stored record).
export function validateAnnouncement(raw: unknown): ValidationResult {
  const parsed = announcementFieldsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid announcement." };
  const f = parsed.data;

  if (f.linkUrl && !isSafeAnnouncementLink(f.linkUrl)) {
    return { ok: false, error: "Link URL must start with https://, http://, or / for a page on this site." };
  }
  if (f.linkUrl && !f.linkLabel) return { ok: false, error: "Add a link label (for example SHOP NOW) for the link." };
  if (f.linkLabel && !f.linkUrl) return { ok: false, error: "A link label needs a link URL." };

  // Inline [label](url) links in the main text follow the same rules as the end link.
  for (const piece of parseAnnouncementText(f.body)) {
    if (!("url" in piece)) continue;
    if (!isSafeAnnouncementLink(piece.url)) {
      return { ok: false, error: `The link "${piece.label}" in the main text must point to https://, http://, or / for a page on this site.` };
    }
    if (piece.label.trim().length === 0 || piece.label.length > 40) {
      return { ok: false, error: "Each link in the main text needs a label of 40 characters or fewer." };
    }
  }

  const startsAt = f.startsAt ? centralLocalToUtcIso(f.startsAt) : null;
  const endsAt = f.endsAt ? centralLocalToUtcIso(f.endsAt) : null;
  if (f.startsAt && !startsAt) return { ok: false, error: "Start date/time isn't a valid date." };
  if (f.endsAt && !endsAt) return { ok: false, error: "End date/time isn't a valid date." };
  if (startsAt && endsAt && endsAt <= startsAt) return { ok: false, error: "End date/time must be after the start date/time." };
  if (f.status === "scheduled" && !startsAt) return { ok: false, error: "A scheduled announcement needs a start date/time." };

  const blocked = findBlockedTerm({ highlight: f.highlight, body: announcementPlainText(f.body), linkLabel: f.linkLabel ?? "" });
  if (blocked) return { ok: false, error: blockedTermMessage(blocked) };

  return {
    ok: true,
    value: {
      audience: f.audience,
      title: f.title,
      highlight: f.highlight,
      body: f.body,
      linkUrl: f.linkUrl,
      linkLabel: f.linkLabel,
      status: f.status,
      startsAt,
      endsAt,
      enabled: f.enabled,
    },
  };
}
