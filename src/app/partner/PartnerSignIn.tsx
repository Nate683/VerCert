"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// What a signed-out visitor to /partner sees, so affiliates sign in where
// their portal is instead of being sent to the storefront's /login. Same
// endpoint and rules as /login; nothing links here from the public site.
export function PartnerSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Incorrect email or password.");
      // An executive signing in here still finishes on the two-factor step.
      if (data.twoFactorRequired) {
        router.push("/two-factor?next=/partner");
        return;
      }
      // A full reload, not router.refresh(): links prefetched while signed out
      // cached the gate's redirect to /register, and only a reload clears them.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect email or password.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Partner Portal</p>
      <h1 className="mt-3 font-serif text-3xl text-navy">Partner Sign In</h1>
      <p className="mt-3 text-sm text-muted">
        Sign in to see your referral code, the orders you drive, and the commission you earn. Got a
        sign-in link from VeriCert? Open that link instead — no password needed.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          autoComplete="email"
          autoFocus
          className="input-field-light"
        />
        <div className="relative">
          <input
            required
            id="partner-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            className="input-field-light pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            aria-controls="partner-password"
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted transition-colors hover:text-navy"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" />
              {showPassword && <path d="M4 4l16 16" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
        {error && (
          <p role="alert" className="border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold-ink disabled:opacity-40"
        >
          {submitting ? "Signing In..." : "Sign In"}
        </button>
      </form>

      <div className="mt-4">
        <Link href="/forgot-password" className="py-2.5 text-slate-900 hover:text-amber-600 text-sm font-medium">
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
