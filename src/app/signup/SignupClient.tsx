"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const next = searchParams.get("next") || "/account";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, marketingOptIn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong creating your account.");
      await refresh();
      router.push(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong creating your account."
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Account</p>
      <h1 className="mt-3 font-serif text-3xl text-white">Create an Account</h1>
      <p className="mt-3 text-sm text-white/50">
        An account is required to complete a purchase.
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
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min. 8 characters)"
          minLength={8}
          className="input-field"
        />
        <label className="flex items-start gap-3 text-xs leading-relaxed text-white/50">
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#c9a227]"
          />
          Send me occasional updates about new compounds and testing results.
        </label>
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
          {submitting ? "Creating Account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-white/40">
        Already have an account?{" "}
        <Link href={`/login${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-gold hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignupClient() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
