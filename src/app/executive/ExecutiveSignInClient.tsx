"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function ExecutiveSignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
        body: JSON.stringify({ email, password, audience: "executive" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Incorrect email or password.");
      const next = typeof data.next === "string" ? data.next : "/command";
      router.push(data.twoFactorRequired ? `/two-factor?next=${encodeURIComponent(next)}` : next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect email or password.");
      setSubmitting(false);
    }
  }

  return (
    <div className="command-shell flex min-h-screen items-center justify-center px-4 py-16">
      <div className="command-panel relative z-10 w-full max-w-md p-8">
        <p className="text-[10px] uppercase tracking-[0.35em] text-gold">VeriCert Executive</p>
        <h1 className="mt-3 font-serif text-3xl text-white">Executive Sign In</h1>
        <p className="mt-3 text-sm text-white/60">
          For VeriCert executives only. Your authenticator code is asked for next.
        </p>
        {searchParams.get("reason") === "idle" && (
          <p role="status" className="mt-4 border border-gold/40 bg-gold/10 p-3 text-sm text-white/80">
            You were signed out after a period of inactivity. Sign in again to continue.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoComplete="username"
            autoFocus
            className="input-field"
          />
          <div className="relative">
            <input
              required
              id="executive-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              aria-label="Password"
              autoComplete="current-password"
              className="input-field pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              aria-controls="executive-password"
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-white/50 transition-colors hover:text-gold"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" />
                {showPassword && <path d="M4 4l16 16" strokeLinecap="round" />}
              </svg>
            </button>
          </div>
          {error && (
            <p role="alert" className="border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
          >
            {submitting ? "Signing In..." : "Continue"}
          </button>
        </form>

        <div className="mt-4">
          <Link href="/forgot-password" className="py-2.5 text-xs text-white/50 hover:text-gold">
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ExecutiveSignInClient() {
  return (
    <Suspense fallback={null}>
      <ExecutiveSignInForm />
    </Suspense>
  );
}
