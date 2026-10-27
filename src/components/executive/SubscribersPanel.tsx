"use client";

import { useCallback, useEffect, useState } from "react";
import type { NewsletterSubscriber } from "@/lib/newsletter/store";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// The footer newsletter list (/command only). Removing someone marks them
// unsubscribed rather than deleting them, so there's a record the request was
// honoured; unsubscribed rows are hidden unless asked for.
export function SubscribersPanel() {
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUnsubscribed, setShowUnsubscribed] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/executive/newsletter", { cache: "no-store" });
    if (res.ok) setSubscribers((await res.json()).subscribers ?? []);
    else setError("Couldn't load the subscriber list.");
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  async function handleRemove(s: NewsletterSubscriber) {
    if (!window.confirm(`Unsubscribe ${s.email}? They'll stay on file as unsubscribed.`)) return;
    setRemovingId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/executive/newsletter/${s.id}/unsubscribe`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't unsubscribe them.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't unsubscribe them.");
    } finally {
      setRemovingId(null);
    }
  }

  const active = subscribers.filter((s) => s.status === "subscribed");
  const unsubscribedCount = subscribers.length - active.length;
  const rows = showUnsubscribed ? subscribers : active;

  return (
    <div className="space-y-6">
      <div className="command-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Newsletter Subscribers</p>
            <p className="mt-3 font-mono text-4xl text-gold">{loading ? "—" : active.length}</p>
            <p className="mt-1 text-xs text-white/40">
              subscribed{unsubscribedCount > 0 ? ` · ${unsubscribedCount} unsubscribed on file` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {unsubscribedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowUnsubscribed((v) => !v)}
                className="border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.15em] text-white/70 transition-colors hover:border-gold hover:text-gold"
              >
                {showUnsubscribed ? "Hide Unsubscribed" : "Show Unsubscribed"}
              </button>
            )}
            <a
              href="/api/executive/newsletter?format=csv"
              className="border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.15em] text-white/70 transition-colors hover:border-gold hover:text-gold"
            >
              Export CSV
            </a>
          </div>
        </div>

        {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}

        <div className="mt-6 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-white/30">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-white/30">No subscribers yet.</p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
                  <th className="pb-3 pr-4 font-normal">Email</th>
                  <th className="pb-3 pr-4 font-normal">Signed Up</th>
                  <th className="pb-3 pr-4 font-normal">Source Page</th>
                  <th className="pb-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-white/5 align-top text-white/80">
                    <td className="py-3 pr-4">
                      <p className="text-white">{s.email}</p>
                      {s.status === "unsubscribed" && (
                        <p className="text-xs text-red-300">
                          Unsubscribed{s.unsubscribedAt ? ` ${formatDate(s.unsubscribedAt)}` : ""}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-white/60">{formatDate(s.consentAt)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-white/60">{s.sourcePath ?? "—"}</td>
                    <td className="py-3">
                      {s.status === "subscribed" && (
                        <button
                          type="button"
                          onClick={() => handleRemove(s)}
                          disabled={removingId === s.id}
                          className="border border-red-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:border-red-400 disabled:opacity-40"
                        >
                          {removingId === s.id ? "Removing..." : "Unsubscribe"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
