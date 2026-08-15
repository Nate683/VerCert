"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAffiliate, setIsAffiliate] = useState(false);
  const [affiliateCode, setAffiliateCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const next = searchParams.get("next") || "/account";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          isAffiliate,
          affiliateCode: isAffiliate ? affiliateCode : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Incorrect email or password.");
      await refresh();
      router.push(data.isAffiliate ? "/affiliate" : next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect email or password.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Account</p>
      <h1 className="mt-3 font-serif text-3xl text-white">Sign In</h1>
      <p className="mt-3 text-sm text-white/50">
        Sign in to check out and view your order history.
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
          placeholder="Password"
          className="input-field"
        />
        <label className="flex items-center gap-3 text-sm text-white/60">
          <input
            type="checkbox"
            checked={isAffiliate}
            onChange={(e) => setIsAffiliate(e.target.checked)}
            className="h-4 w-4 accent-[#c9a227]"
          />
          I&apos;m an Affiliate
        </label>
        {isAffiliate && (
          <input
            required
            value={affiliateCode}
            onChange={(e) => setAffiliateCode(e.target.value)}
            placeholder="Affiliate Code"
            className="input-field"
          />
        )}
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
          {submitting ? "Signing In..." : "Sign In"}
        </button>
      </form>

      <div className="mt-6 flex justify-between text-xs text-white/40">
        <Link href="/forgot-password" className="hover:text-gold">
          Forgot password?
        </Link>
        <Link href={`/signup${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`} className="hover:text-gold">
          Create an account
        </Link>
      </div>
    </div>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
