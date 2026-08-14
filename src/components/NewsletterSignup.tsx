"use client";

import { useState } from "react";

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p className="text-sm text-gold">You&apos;re subscribed. Thank you.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm">
      <div className="flex gap-2">
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="input-field"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="shrink-0 border border-gold px-4 py-3 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
        >
          {status === "sending" ? "..." : "Subscribe"}
        </button>
      </div>
      {status === "error" && (
        <p className="mt-2 text-xs text-red-300">Something went wrong. Try again.</p>
      )}
    </form>
  );
}
