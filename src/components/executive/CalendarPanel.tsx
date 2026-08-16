"use client";

import { useCallback, useEffect, useState } from "react";
import type { CalendarEvent, CalendarEventType } from "@/lib/types";

const TYPE_LABEL: Record<CalendarEventType, string> = {
  launch: "Launch",
  restock: "Restock",
  payout: "Payout",
  other: "Other",
};

export function CalendarPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<CalendarEventType>("launch");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async () => {
    setNow(Date.now());
    const res = await fetch("/api/executive/calendar", { cache: "no-store" });
    if (res.ok) setEvents((await res.json()).events ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/executive/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type, date, notes: notes || undefined }),
      });
      setTitle("");
      setNotes("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/executive/calendar/${id}`, { method: "DELETE" });
    await load();
  }

  const cardClass = isCommand ? "command-panel p-6" : "office-card";
  const upcoming = events.filter((e) => new Date(e.date).getTime() >= (now ?? 0) - 24 * 60 * 60 * 1000);
  const past = events.filter((e) => new Date(e.date).getTime() < (now ?? 0) - 24 * 60 * 60 * 1000);

  if (loading) return <p className="text-sm text-white/30">Loading...</p>;

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">New Event</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="input-field"
          />
          <select value={type} onChange={(e) => setType(e.target.value as CalendarEventType)} className="input-field">
            {(Object.keys(TYPE_LABEL) as CalendarEventType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field" />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="input-field" />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
        >
          {saving ? "Saving..." : "Add Event"}
        </button>
      </form>

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Upcoming ({upcoming.length})</p>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">Nothing scheduled.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 text-sm">
                <span className="text-white/80">
                  {e.title}
                  {e.notes && <span className="ml-2 text-white/40">— {e.notes}</span>}
                </span>
                <span className="flex items-center gap-3 text-xs text-white/40">
                  <span className="uppercase tracking-[0.1em] text-gold">{TYPE_LABEL[e.type]}</span>
                  <span>{new Date(e.date).toLocaleDateString()}</span>
                  <button type="button" onClick={() => handleDelete(e.id)} className="text-white/30 hover:text-red-300">
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {past.length > 0 && (
        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Past</p>
          <ul className="mt-3 space-y-2">
            {past.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm text-white/40">
                <span>{e.title}</span>
                <span>{new Date(e.date).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
