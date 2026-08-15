"use client";

import { useEffect, useRef } from "react";

// Polls `refresh` on an interval while the tab is visible, and immediately
// on regaining visibility, so executive panels reflect new data without a
// manual reload. Pass `pause` to skip ticks while the user has an
// in-progress edit open (e.g. an inline form) so we don't clobber input.
export function useLiveRefresh(refresh: () => void, intervalMs = 20000, pause = false) {
  const refreshRef = useRef(refresh);
  const pauseRef = useRef(pause);

  useEffect(() => {
    refreshRef.current = refresh;
    pauseRef.current = pause;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && !pauseRef.current) refreshRef.current();
    }, intervalMs);
    function handleVisibility() {
      if (document.visibilityState === "visible" && !pauseRef.current) refreshRef.current();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs]);
}
