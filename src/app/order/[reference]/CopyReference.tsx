"use client";

import { useState } from "react";

// The order reference is the one string a customer needs when they email us
// or quote a bank transfer, so make it a single click to take with them.
export function CopyReference({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the reference is still on screen.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-2 border border-hairline px-3 py-1.5 font-mono text-sm text-navy transition-colors hover:border-gold hover:text-gold-ink"
      aria-label={`Copy order reference ${reference}`}
    >
      {reference}
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
