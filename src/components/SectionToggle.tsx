"use client";

import { useRouter } from "next/navigation";
import { useExecMode } from "@/lib/exec-mode-context";

// Exec-mode-only control to hide/show an entire homepage section without
// deleting its content — the closest safe equivalent to "add/remove
// sections" without a full page-builder. Renders nothing when exec mode is off.
export function SectionToggle({ sectionKey, visible }: { sectionKey: string; visible: boolean }) {
  const { execMode, beginSave, endSave } = useExecMode();
  const router = useRouter();

  if (!execMode) return null;

  async function handleToggle() {
    beginSave();
    try {
      const res = await fetch("/api/executive/inline-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "home_sections", patch: { [sectionKey]: !visible } }),
      });
      if (!res.ok) throw new Error("Failed to save.");
      endSave(true);
      router.refresh();
    } catch {
      endSave(false);
    }
  }

  return (
    <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-10">
      <button
        type="button"
        onClick={handleToggle}
        className="absolute right-6 top-4 border border-gold/50 bg-black/80 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-gold hover:bg-gold hover:text-black"
      >
        {visible ? "Hide Section" : "Show Section"}
      </button>
    </div>
  );
}
