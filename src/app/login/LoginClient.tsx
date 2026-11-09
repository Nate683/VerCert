"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";
import Image from "next/image";
import { CornerWatermarks } from "@/components/CornerWatermarks";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A plain sign-in lands on the homepage; a sign-in sent here from a
  // protected page (?next=/checkout, /account, …) still returns there.
  const next = safeNextPath(searchParams.get("next")) ?? "/";

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
      // Executive accounts finish signing in on the two-factor step.
      if (data.twoFactorRequired) {
        router.push(`/two-factor?next=${encodeURIComponent(next)}`);
        return;
      }
      // A full page load, not router.push: links prefetched while signed out
      // cached the gate's redirect to /register, and router.refresh() clears
      // only the current page, so the next click on Shop would replay it.
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect email or password.");
      setSubmitting(false);
    }
  }

  return (
    // Vertically centred in the white area between header and footer, which carries the corner emblem watermarks
    // (components/CornerWatermarks.tsx).
    <CornerWatermarks>
    <div className="mx-auto w-full max-w-md px-6 py-12 lg:px-10">
      {/* The full lockup as a transparent vector (the homepage hero's file), so the watermarks show cleanly behind
          it; the old Logo.jpg has a white background. Its artwork fills 267 of 298 viewBox units: at 196px it shows
          ≈176px of artwork, 1.45× the ≈121px the 200px JPG showed. */}
      <Image
        src="/VeriCert-Peptides-Full-Color-RGB-V2.svg"
        alt="VeriCert Peptides"
        width={298}
        height={149}
        unoptimized
        priority
        className="mx-auto mb-6 block h-auto w-[196px]"
      />
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Account</p>
      <h1 className="mt-3 font-serif text-3xl text-navy">Sign In</h1>
      <p className="mt-3 text-sm text-muted">
        Sign in to access your research account, manage orders, and view your order history.
      </p>
      {searchParams.get("reason") === "idle" && (
        <p role="status" className="mt-4 border border-gold/50 bg-gold/10 p-3 text-sm text-navy">
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
          autoFocus
          className="input-field-light"
        />
        <div className="relative">
          <input
            required
            id="login-password"
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
            aria-controls="login-password"
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

      <div className="mt-4 flex justify-between">
        <Link href="/forgot-password" className="py-2.5 text-slate-900 hover:text-amber-600 text-sm font-medium">
          Forgot password?
        </Link>
        <Link href={`/register${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`} className="py-2.5 text-slate-900 hover:text-amber-600 text-sm font-medium">
          Create an account
        </Link>
      </div>
    </div>
    </CornerWatermarks>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
