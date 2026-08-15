"use client";

import { useState } from "react";

export function EmailChangeForm({ pendingEmail }: { pendingEmail?: string }) {
  const [newEmail, setNewEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(pendingEmail ?? null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/account/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start email change.");
      setPending(newEmail);
      setNewEmail("");
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start email change.");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-3">
      {pending && (
        <p className="text-xs text-gold">
          Verification email sent to <span className="font-mono">{pending}</span> — check your
          inbox to finish the change.
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
        <input
          type="email"
          required
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="New email address"
          className="border border-white/15 bg-black px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-gold focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "saving" || !newEmail}
          className="border border-gold px-5 py-2 text-xs uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "saving" ? "Sending..." : "Send Verification"}
        </button>
      </form>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
