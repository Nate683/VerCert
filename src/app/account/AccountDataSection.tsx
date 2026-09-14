"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// Download and delete — the access and deletion rights, self-service.
export function AccountDataSection() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirm: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't delete your account. Please try again.");
      // The session is gone now; bring the header up to date, then leave.
      await refresh();
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete your account. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm leading-relaxed text-muted">
          Download everything we hold about you — your profile, orders, browsing and email activity — as a
          JSON file.
        </p>
        <a
          href="/api/account/export"
          className="mt-3 inline-block border border-gold px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-gold-ink transition-colors hover:bg-gold hover:text-black"
        >
          Download My Data
        </a>
      </div>

      <div className="border-t border-hairline pt-6">
        {!confirming ? (
          <>
            <p className="text-sm leading-relaxed text-muted">
              Deleting your account removes your name, email, addresses, browsing history and email
              preferences. We keep records of past orders for accounting, with your details removed.
            </p>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 border border-red-700/50 px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-red-700 transition-colors hover:bg-red-700 hover:text-white"
            >
              Delete My Account
            </button>
          </>
        ) : (
          <form onSubmit={handleDelete} className="space-y-3 border border-red-700/30 bg-red-50 p-5">
            <p className="text-sm text-navy">
              This can&apos;t be undone. Enter your password and type <span className="font-mono">DELETE</span> to
              confirm.
            </p>
            <input
              id="delete-account-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              aria-label="Password"
              autoComplete="current-password"
              className="input-field-light"
            />
            <input
              id="delete-account-confirm"
              required
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type DELETE"
              aria-label="Type DELETE to confirm"
              autoComplete="off"
              className="input-field-light font-mono"
            />
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={deleting || typed !== "DELETE" || !password}
                className="border border-red-700 bg-red-700 px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-white transition-colors hover:bg-red-800 disabled:opacity-40"
              >
                {deleting ? "Deleting..." : "Permanently Delete"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                className="border border-control px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-navy transition-colors hover:border-gold-ink"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
