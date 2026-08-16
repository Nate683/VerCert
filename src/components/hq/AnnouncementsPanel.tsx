"use client";

import { useCallback, useEffect, useState } from "react";
import type { HqMember } from "@/lib/hq";
import type { HqAnnouncement } from "@/lib/types";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";

export function AnnouncementsPanel({ member }: { member: HqMember }) {
  const isExecutive = member.kind === "executive";
  const [announcements, setAnnouncements] = useState<HqAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/hq/announcements", { cache: "no-store" });
    if (res.ok) setAnnouncements((await res.json()).announcements ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);
  useLiveRefresh(load, 15000);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/hq/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, pinned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not post announcement.");
      setTitle("");
      setBody("");
      setPinned(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post announcement.");
    } finally {
      setPosting(false);
    }
  }

  async function togglePin(a: HqAnnouncement) {
    await fetch(`/api/hq/announcements/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !a.pinned }),
    });
    await load();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this announcement?")) return;
    await fetch(`/api/hq/announcements/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {isExecutive && (
        <form onSubmit={handlePost} className="border border-gold/20 bg-white/[0.02] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Post Announcement</p>
          <div className="mt-4 space-y-3">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="input-field"
            />
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What's the update?"
              rows={4}
              className="input-field"
            />
            <label className="flex items-center gap-3 text-sm text-white/60">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="h-4 w-4 accent-[#c9a227]"
              />
              Pin to top
            </label>
          </div>
          {error && <p className="mt-3 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={posting}
            className="mt-4 border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
          >
            {posting ? "Posting..." : "Post"}
          </button>
        </form>
      )}

      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-white/30">Loading...</p>
        ) : announcements.length === 0 ? (
          <p className="text-sm text-white/30">No announcements yet.</p>
        ) : (
          announcements.map((a) => (
            <div key={a.id} className="border border-white/10 bg-white/[0.02] p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  {a.pinned && <p className="text-[10px] uppercase tracking-[0.15em] text-gold">Pinned</p>}
                  <h3 className="mt-1 font-serif text-lg text-white">{a.title}</h3>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-white/30">
                    {a.authorName} · {new Date(a.createdAt).toLocaleString()}
                  </p>
                </div>
                {isExecutive && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => togglePin(a)}
                      className="border border-white/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/60 hover:border-gold hover:text-gold"
                    >
                      {a.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      className="border border-red-500/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:border-red-400"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-white/70">{a.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
