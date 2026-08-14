"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setSubmitting(false);
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Account</p>
      <h1 className="mt-3 font-serif text-3xl text-white">Reset Password</h1>

      {sent ? (
        <p className="mt-6 text-sm leading-relaxed text-white/60">
          If an account exists for {email}, we&apos;ve sent a link to reset
          your password. It expires in 1 hour.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-white/50">
            Enter your email and we&apos;ll send you a reset link.
          </p>
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              autoFocus
              className="input-field"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
            >
              {submitting ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-xs text-white/40">
        <Link href="/login" className="text-gold hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
