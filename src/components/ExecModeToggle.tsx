"use client";

import { useExecMode } from "@/lib/exec-mode-context";

// Fixed top-left toggle — only ever rendered for command/office sessions
// (see useExecMode: canUseExecMode is false for customers/logged-out
// visitors, so this returns null and nothing about the page changes).
export function ExecModeToggle() {
  const { canUseExecMode, execMode, toggleExecMode, saveState } = useExecMode();

  if (!canUseExecMode) return null;

  return (
    <div className="fixed left-4 top-4 z-[200] flex items-center gap-2">
      <button
        type="button"
        onClick={toggleExecMode}
        className={`border px-3 py-2 text-[10px] uppercase tracking-[0.15em] shadow-lg backdrop-blur transition-colors ${
          execMode
            ? "border-gold bg-gold text-black"
            : "border-white/30 bg-black/80 text-white/70 hover:border-gold hover:text-gold"
        }`}
      >
        {execMode ? "Exec Mode: ON" : "Exec Mode: OFF"}
      </button>
      {execMode && saveState !== "idle" && (
        <span
          className={`border px-2 py-1.5 text-[9px] uppercase tracking-[0.1em] backdrop-blur ${
            saveState === "saving"
              ? "border-white/30 bg-black/80 text-white/60"
              : saveState === "saved"
              ? "border-emerald-400/40 bg-black/80 text-emerald-300"
              : "border-red-500/40 bg-black/80 text-red-300"
          }`}
        >
          {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Error"}
        </span>
      )}
    </div>
  );
}
