"use client";

import { useState } from "react";
import { PasswordField } from "@/components/PasswordField";

// Tidies the address without re-rendering the page, which would remove this
// card before its confirmation could be read. A reload then shows no card.
function dropWelcomeFromUrl() {
  window.history.replaceState(null, "", "/partner");
}

// Offered on /partner right after someone arrives by sign-in link, so next
// time they can sign in at /login without needing another link. `token` is
// the short-lived set-password token that link issued; saving goes through
// the normal reset-password endpoint and its password rules.
export function SetPasswordCard({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Your password couldn't be saved.");
      setDone(true);
      dropWelcomeFromUrl();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your password couldn't be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  if (dismissed) return null;

  if (done) {
    return (
      <section className="mt-8 border border-gold/20 bg-surface p-5">
        <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">Password Saved</h2>
        <p className="mt-3 text-sm text-muted">
          Next time, sign in at /login with <strong className="text-navy">{email}</strong> and your new password.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 border border-gold/20 bg-surface p-5">
      <h2 className="text-xs uppercase tracking-[0.25em] text-gold-ink">Choose a Password</h2>
      <p className="mt-3 text-sm text-muted">
        Your sign-in link has now been used. Set a password so you can sign in at /login with{" "}
        <strong className="text-navy">{email}</strong>. Already have one? You can skip this.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <PasswordField
          id="partner-new-password"
          value={password}
          onChange={setPassword}
          context={{ email }}
          placeholder="New password"
        />
        {error && (
          <p role="alert" className="border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold-ink disabled:opacity-40"
          >
            {submitting ? "Saving..." : "Save Password"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              dropWelcomeFromUrl();
            }}
            className="border border-hairline px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-navy"
          >
            Skip for Now
          </button>
        </div>
      </form>
    </section>
  );
}
