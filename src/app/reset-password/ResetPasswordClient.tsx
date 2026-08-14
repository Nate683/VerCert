"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

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
      if (!res.ok) throw new Error(data.error ?? "This reset link is invalid or has expired.");
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "This reset link is invalid or has expired."
      );
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20 text-center lg:px-10">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Account</p>
        <h1 className="mt-3 font-serif text-3xl text-white">Invalid Link</h1>
        <p className="mt-3 text-sm text-white/50">
          This password reset link is missing a token.
        </p>
        <Link href="/forgot-password" className="mt-6 text-xs text-gold hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20 text-center lg:px-10">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Password Updated</p>
        <h1 className="mt-3 font-serif text-3xl text-white">Success</h1>
        <p className="mt-3 text-sm text-white/50">Redirecting you to sign in...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Account</p>
      <h1 className="mt-3 font-serif text-3xl text-white">Choose a New Password</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (min. 8 characters)"
          minLength={8}
          autoFocus
          className="input-field"
        />
        {error && (
          <p className="border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
        >
          {submitting ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordClient() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
