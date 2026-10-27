"use client";

import { useState } from "react";

// The footer newsletter form. The success message appears only once the
// server has saved the address; an invalid address gets its message under
// the field.
export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: window.location.pathname }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          res.status === 429
            ? "Too many signups from this connection. Please try again later."
            : data.error ?? "Something went wrong. Try again."
        );
        setStatus("idle");
        return;
      }
      setStatus("done");
      setEmail("");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <p role="status" className="text-sm text-gold">
        You&apos;re subscribed. Thank you.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm" noValidate>
      <div className="flex gap-2">
        <input
          required
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Email address"
          aria-label="Email address"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "newsletter-error" : undefined}
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
      {error && (
        <p id="newsletter-error" role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
