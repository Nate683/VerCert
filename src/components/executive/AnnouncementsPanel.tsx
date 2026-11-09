"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_AUDIENCE_LABELS,
  ANNOUNCEMENT_STATE_LABELS,
  ANNOUNCEMENT_STATUSES,
  ANNOUNCEMENT_STATUS_LABELS,
  announcementState,
  type Announcement,
  type AnnouncementAudience,
  type AnnouncementState,
  type AnnouncementStatus,
} from "@/lib/announcements/rules";
import { ADMIN_TIME_ZONE_LABEL, centralLocalToUtcIso, formatCentral, utcIsoToCentralLocal } from "@/lib/announcements/time";
import { AnnouncementContent } from "@/components/AnnouncementContent";

// /command-only tab: the announcement bar under the ticker, for logged-in customers and for logged-out visitors. Every save goes through
// /api/executive/announcements, which checks the command role and validates again on the server.

type FormState = {
  audience: AnnouncementAudience;
  title: string;
  highlight: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
  status: AnnouncementStatus;
  startsAt: string; // Central wall time, datetime-local format
  endsAt: string;
  enabled: boolean;
};

function emptyForm(): FormState {
  return { audience: "member", title: "", highlight: "", body: "", linkUrl: "", linkLabel: "", status: "draft", startsAt: "", endsAt: "", enabled: true };
}

function toForm(a: Announcement): FormState {
  return {
    audience: a.audience,
    title: a.title,
    highlight: a.highlight,
    body: a.body,
    linkUrl: a.linkUrl ?? "",
    linkLabel: a.linkLabel ?? "",
    status: a.status,
    startsAt: a.startsAt ? utcIsoToCentralLocal(a.startsAt) : "",
    endsAt: a.endsAt ? utcIsoToCentralLocal(a.endsAt) : "",
    enabled: a.enabled,
  };
}

const STATE_CLASS: Record<AnnouncementState, string> = {
  live: "border-[var(--x-border-strong)] text-[var(--x-text)]",
  scheduled: "border-white/40 text-white/80",
  draft: "border-white/20 text-white/50",
  disabled: "border-white/20 text-white/40",
  expired: "border-white/15 text-white/35",
};

const BUTTON = "border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)]";
const LABEL = "text-[10px] uppercase tracking-[0.1em] text-white/40";

export function AnnouncementsPanel() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [serverNow, setServerNow] = useState<string>(new Date().toISOString());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/executive/announcements", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load announcements.");
      setAnnouncements(data.announcements);
      setServerNow(data.serverNow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load announcements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  const liveFor = (audience: AnnouncementAudience) =>
    announcements.find((a) => a.audience === audience && announcementState(a, serverNow) === "live") ?? null;

  function startNew(audience: AnnouncementAudience) {
    setForm({ ...emptyForm(), audience });
    setEditing("new");
    setError(null);
    setNotice(null);
  }

  function startEdit(a: Announcement) {
    setForm(toForm(a));
    setEditing(a.id);
    setError(null);
    setNotice(null);
  }

  async function send(url: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    setNotice(null);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      return false;
    }
    return true;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // The server checks all of this again; this just answers sooner.
    const start = form.startsAt ? centralLocalToUtcIso(form.startsAt) : null;
    const end = form.endsAt ? centralLocalToUtcIso(form.endsAt) : null;
    if (start && end && end <= start) {
      setError("End date/time must be after the start date/time.");
      return;
    }
    setSaving(true);
    const isNew = editing === "new";
    const ok = await send(isNew ? "/api/executive/announcements" : `/api/executive/announcements/${editing}`, isNew ? "POST" : "PATCH", {
      ...form,
      linkUrl: form.linkUrl.trim() || null,
      linkLabel: form.linkLabel.trim() || null,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
    });
    setSaving(false);
    if (ok) {
      setEditing(null);
      setNotice(isNew ? `Created "${form.title.trim()}".` : `Saved "${form.title.trim()}".`);
      await load();
    }
  }

  async function handleToggle(a: Announcement) {
    if (await send(`/api/executive/announcements/${a.id}`, "PATCH", { enabled: !a.enabled })) {
      setNotice(`${a.enabled ? "Disabled" : "Enabled"} "${a.title}".`);
      await load();
    }
  }

  async function handleDelete(a: Announcement) {
    if (!window.confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    if (await send(`/api/executive/announcements/${a.id}`, "DELETE")) {
      if (editing === a.id) setEditing(null);
      setNotice(`Deleted "${a.title}".`);
      await load();
    }
  }

  const preview = form.highlight.trim() || form.body.trim()
    ? { highlight: form.highlight.trim() || "GOLD TEXT", body: form.body.trim() || "Main announcement text.", linkUrl: form.linkUrl.trim() || null, linkLabel: form.linkLabel.trim() || null }
    : null;

  return (
    <div className="space-y-6">
      <div className="command-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Announcement Banners</p>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              The navy bar under the ticker. Each announcement targets one audience:{" "}
              <span className="text-[var(--x-text)]">logged-in customers</span> or{" "}
              <span className="text-[var(--x-text)]">logged-out visitors</span>.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/50">
              One announcement per audience shows at a time. Saving one that overlaps another live or scheduled
              announcement for the same audience is refused. Drafts, disabled and expired announcements never show;
              scheduled ones go live by themselves at their start time and stop at their end time. With nothing live
              for an audience, that audience sees no bar. Times are {ADMIN_TIME_ZONE_LABEL}. Visitors see a change on
              their next page load.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ANNOUNCEMENT_AUDIENCES.map((audience) => (
              <button
                key={audience}
                type="button"
                onClick={() => startNew(audience)}
                className="border border-[var(--x-border-strong)] px-4 py-2 text-xs uppercase tracking-[0.15em] text-[var(--x-text)] transition-colors hover:bg-[var(--x-raised)] hover:border-[var(--x-text)]"
              >
                + New — {ANNOUNCEMENT_AUDIENCE_LABELS[audience]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ANNOUNCEMENT_AUDIENCES.map((audience) => {
            const live = liveFor(audience);
            return (
              <div key={audience} data-showing={audience}>
                <p className={LABEL}>Showing now to {ANNOUNCEMENT_AUDIENCE_LABELS[audience].toLowerCase()}</p>
                {live ? (
                  <div className="mt-2 border border-gold/20 bg-navy px-4 py-2.5 text-center text-xs leading-relaxed text-white/85">
                    <AnnouncementContent announcement={live} />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-white/50">Nothing — {ANNOUNCEMENT_AUDIENCE_LABELS[audience].toLowerCase()} see no announcement bar.</p>
                )}
              </div>
            );
          })}
        </div>

        {notice && <p role="status" className="mt-4 border border-[var(--x-positive)]/40 bg-transparent p-3 text-xs text-[var(--x-positive)]">{notice}</p>}
        {error && <p role="alert" className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}

        <div className="mt-6 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-white/30">Loading...</p>
          ) : announcements.length === 0 ? (
            <p className="text-sm text-white/30">No announcements yet.</p>
          ) : (
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/15 text-xs uppercase tracking-[0.1em] text-white/40">
                  <th className="pb-3 pr-4 font-normal">Audience</th>
                  <th className="pb-3 pr-4 font-normal">Title</th>
                  <th className="pb-3 pr-4 font-normal">Preview</th>
                  <th className="pb-3 pr-4 font-normal">Status</th>
                  <th className="pb-3 pr-4 font-normal">Start</th>
                  <th className="pb-3 pr-4 font-normal">End</th>
                  <th className="pb-3 pr-4 font-normal">Last modified</th>
                  <th className="pb-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map((a) => {
                  const state = announcementState(a, serverNow);
                  return (
                    <tr key={a.id} data-announcement={a.id} className="border-b border-white/5 align-top text-white/80">
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-block whitespace-nowrap border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${
                            a.audience === "member" ? "border-[var(--x-border-strong)] text-[var(--x-text)]" : "border-[var(--x-border-strong)] text-[var(--x-muted)]"
                          }`}
                        >
                          {ANNOUNCEMENT_AUDIENCE_LABELS[a.audience]}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{a.title}</td>
                      <td className="max-w-[340px] py-3 pr-4 text-xs leading-relaxed text-white/80">
                        <AnnouncementContent announcement={a} />
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${STATE_CLASS[state]}`}>
                          {ANNOUNCEMENT_STATE_LABELS[state]}
                        </span>
                        {ANNOUNCEMENT_STATE_LABELS[state] !== ANNOUNCEMENT_STATUS_LABELS[a.status] && (
                          <span className="mt-1 block text-[10px] text-white/40">set to {ANNOUNCEMENT_STATUS_LABELS[a.status]}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-white/60">{a.startsAt ? formatCentral(a.startsAt) : "Immediately"}</td>
                      <td className="py-3 pr-4 text-xs text-white/60">{a.endsAt ? formatCentral(a.endsAt) : "No end"}</td>
                      <td className="py-3 pr-4 text-xs text-white/60">
                        {formatCentral(a.updatedAt)}
                        {a.updatedBy && <span className="block text-[10px] text-white/35">{a.updatedBy}</span>}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => startEdit(a)} className={BUTTON}>Edit</button>
                          <button type="button" onClick={() => handleToggle(a)} className={BUTTON}>{a.enabled ? "Disable" : "Enable"}</button>
                          <button
                            type="button"
                            onClick={() => handleDelete(a)}
                            className="border border-[var(--x-border-strong)] px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-[var(--x-text-2)] hover:border-[var(--x-negative)] hover:text-[var(--x-negative)]"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <form onSubmit={handleSave} className="command-panel p-6" noValidate>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">
            {editing === "new" ? "New Announcement" : `Edit — ${announcements.find((a) => a.id === editing)?.title ?? ""}`}
          </p>
          <p className="mt-2 text-xs text-white/50">
            Shown to {ANNOUNCEMENT_AUDIENCE_LABELS[form.audience].toLowerCase()} only. Plain text, no formatting; to
            put a link inside the main text, write [link text](/page) — for example [Create a free account](/register).
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={LABEL}>Audience — who sees it</span>
              <select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value as AnnouncementAudience }))} className="input-field mt-1" aria-label="Audience">
                {ANNOUNCEMENT_AUDIENCES.map((a) => (
                  <option key={a} value={a}>{ANNOUNCEMENT_AUDIENCE_LABELS[a]}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className={LABEL}>Internal title (admin list only)</span>
              <input value={form.title} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="input-field mt-1" aria-label="Internal title" />
            </label>
            <label className="block">
              <span className={LABEL}>Gold-highlighted text</span>
              <input value={form.highlight} maxLength={60} onChange={(e) => setForm((f) => ({ ...f, highlight: e.target.value }))} placeholder="VERICERT MEMBER EXCLUSIVE" className="input-field mt-1" aria-label="Gold-highlighted text" />
            </label>
            <label className="block">
              <span className={LABEL}>Main announcement text</span>
              <input value={form.body} maxLength={240} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} className="input-field mt-1" aria-label="Main announcement text" />
            </label>
            <label className="block">
              <span className={LABEL}>Link URL (optional): https://… or /page</span>
              <input value={form.linkUrl} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} placeholder="/shop" className="input-field mt-1" aria-label="Link URL" />
            </label>
            <label className="block">
              <span className={LABEL}>Link label (optional)</span>
              <input value={form.linkLabel} maxLength={40} onChange={(e) => setForm((f) => ({ ...f, linkLabel: e.target.value }))} placeholder="SHOP NOW" className="input-field mt-1" aria-label="Link label" />
            </label>
            <label className="block">
              <span className={LABEL}>Status</span>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AnnouncementStatus }))} className="input-field mt-1" aria-label="Status">
                {ANNOUNCEMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{ANNOUNCEMENT_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="input-field flex items-center gap-3 self-end">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="h-4 w-4 accent-gold" aria-label="Enabled" />
              <span className="text-sm text-white/70">{form.enabled ? "Enabled" : "Disabled — never shows"}</span>
            </label>
            <label className="block">
              <span className={LABEL}>Start date/time (optional) — {ADMIN_TIME_ZONE_LABEL}</span>
              <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} className="input-field mt-1" aria-label="Start date/time (US Central)" />
            </label>
            <label className="block">
              <span className={LABEL}>End date/time (optional) — {ADMIN_TIME_ZONE_LABEL}</span>
              <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} className="input-field mt-1" aria-label="End date/time (US Central)" />
            </label>
          </div>

          <div className="mt-5">
            <p className={LABEL}>Preview — as {ANNOUNCEMENT_AUDIENCE_LABELS[form.audience].toLowerCase()} will see it</p>
            <div className="mt-2 border border-gold/20 bg-navy px-4 py-2.5 text-center text-xs leading-relaxed text-white/85">
              {preview ? <AnnouncementContent announcement={preview} /> : <span className="text-white/40">Fill in the text to preview the bar.</span>}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" disabled={saving} className="border border-[var(--x-muted)] bg-[var(--x-raised)] px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-[var(--x-text)] transition-colors hover:border-[var(--x-text)] disabled:opacity-40">
              {saving ? "Saving..." : editing === "new" ? "Create Announcement" : "Save Announcement"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="border border-white/20 px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)]">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
