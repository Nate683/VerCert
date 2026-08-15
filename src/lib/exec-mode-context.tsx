"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

type SaveState = "idle" | "saving" | "saved" | "error";

type ExecModeContextValue = {
  canUseExecMode: boolean;
  execMode: boolean;
  toggleExecMode: () => void;
  saveState: SaveState;
  beginSave: () => void;
  endSave: (ok: boolean) => void;
};

const ExecModeContext = createContext<ExecModeContextValue | null>(null);
const STORAGE_KEY = "vericert-exec-mode";

// Gates the whole Live Edit Mode feature behind the current session's role —
// invisible and fully inert for customers/logged-out visitors, since
// canUseExecMode (and therefore execMode) can never be true for them.
export function ExecModeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const canUseExecMode = user?.role === "command" || user?.role === "office";
  const [rawExecMode, setRawExecMode] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    if (!canUseExecMode) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of the toggle's last state
      setRawExecMode(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // ignore
    }
  }, [canUseExecMode]);

  const toggleExecMode = useCallback(() => {
    setRawExecMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const beginSave = useCallback(() => setSaveState("saving"), []);
  const endSave = useCallback((ok: boolean) => {
    setSaveState(ok ? "saved" : "error");
    setTimeout(() => setSaveState("idle"), 2000);
  }, []);

  const value: ExecModeContextValue = {
    canUseExecMode,
    execMode: canUseExecMode && rawExecMode,
    toggleExecMode,
    saveState,
    beginSave,
    endSave,
  };

  return <ExecModeContext.Provider value={value}>{children}</ExecModeContext.Provider>;
}

export function useExecMode() {
  const ctx = useContext(ExecModeContext);
  if (!ctx) throw new Error("useExecMode must be used within an ExecModeProvider");
  return ctx;
}
