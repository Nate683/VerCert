"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HqMember } from "@/lib/hq";
import { ChatPanel } from "./ChatPanel";
import { AnnouncementsPanel } from "./AnnouncementsPanel";
import { ResourcesPanel } from "./ResourcesPanel";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { DirectoryPanel } from "./DirectoryPanel";

type Tab = "chat" | "announcements" | "resources" | "leaderboard" | "directory";

const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "announcements", label: "Announcements" },
  { id: "resources", label: "Resources" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "directory", label: "Directory" },
];

export function HqWorkspace({ member }: { member: HqMember }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("chat");

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="command-grain flex min-h-screen flex-col bg-black text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-gold">VeriCert HQ</p>
          <p className="mt-1 text-sm text-white/50">
            {member.name} · {member.kind === "executive" ? "Executive" : "Affiliate"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.15em] text-white/60 transition-colors hover:border-gold hover:text-gold"
        >
          Log Out
        </button>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-white/10 px-4 sm:px-8">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-xs uppercase tracking-[0.2em] transition-colors ${
              tab === t.id ? "border-gold text-gold" : "border-transparent text-white/50 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        {tab === "chat" && <ChatPanel member={member} />}
        {tab === "announcements" && <AnnouncementsPanel member={member} />}
        {tab === "resources" && <ResourcesPanel member={member} />}
        {tab === "leaderboard" && <LeaderboardPanel member={member} />}
        {tab === "directory" && <DirectoryPanel />}
      </div>
    </div>
  );
}
