"use client";

import { useCallback, useEffect, useState } from "react";
import type { AffiliateTier } from "@/lib/types";

type DirectoryEntry = { name: string; tier?: AffiliateTier; joinedAt: string };

const TIER_LABELS: Record<AffiliateTier, string> = {
  standard: "Standard",
  associate: "Associate",
  principal: "Principal",
  managing_principal: "Managing Principal",
  partner: "Partner",
};

export function DirectoryPanel() {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/hq/directory", { cache: "no-store" });
    if (res.ok) setEntries((await res.json()).directory ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl">
      {loading ? (
        <p className="text-sm text-white/30">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-white/30">No affiliates yet.</p>
      ) : (
        <div className="divide-y divide-white/10 border-y border-white/10">
          {entries.map((e, i) => (
            <div key={e.name + i} className="flex items-center justify-between py-4">
              <p className="text-white">{e.name}</p>
              <div className="flex items-center gap-4 text-xs text-white/50">
                <span>{e.tier ? TIER_LABELS[e.tier] : "—"}</span>
                <span>Joined {new Date(e.joinedAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
