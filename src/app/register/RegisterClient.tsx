"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { safeNextPath } from "@/lib/safe-next";
import { HEARD_ABOUT_OPTIONS } from "@/lib/marketing/heard-about";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [heardAbout, setHeardAbout] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [isAffiliate, setIsAffiliate] = useState(searchParams.get("affiliate") === "1");
  const [inviteCode, setInviteCode] = useState(searchParams.get("code")?.toUpperCase() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [invalidCode, setInvalidCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Where the visitor was headed when the gate sent them here; otherwise the catalog.
  const next = safeNextPath(searchParams.get("next")) ?? "/shop";

  async function submit(asAffiliate: boolean) {
    setSubmitting(true);
    setError(null);
    setInvalidCode(false);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
          company: company.trim() || undefined,
          heardAbout: heardAbout || undefined,
          marketingOptIn,
          isAffiliate: asAffiliate,
          inviteCode: asAffiliate ? inviteCode : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvalidCode(Boolean(data.invalidCode));
        throw new Error(data.error ?? "Something went wrong creating your account.");
      }
      await refresh();
      router.push(data.isAffiliate ? "/partner" : next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong creating your account.");
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit(isAffiliate);
  }

  async function handleContinueAsCustomer() {
    setIsAffiliate(false);
    await submit(false);
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Research Account</p>
      <h1 className="mt-3 font-serif text-3xl text-navy">Create an Account</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        The catalog, pricing and batch certificates are open to registered researchers. It takes a
        minute — we&apos;ll only ask for a shipping address when you check out.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input
            id="register-first-name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            aria-label="First name"
            autoComplete="given-name"
            autoFocus
            maxLength={100}
            className="input-field-light"
          />
          <input
            id="register-last-name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            aria-label="Last name"
            autoComplete="family-name"
            maxLength={100}
            className="input-field-light"
          />
        </div>
        <input
          id="register-email"
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          aria-label="Email address"
          autoComplete="email"
          className="input-field-light"
        />
        <input
          id="register-password"
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min. 8 characters)"
          aria-label="Password"
          autoComplete="new-password"
          minLength={8}
          className="input-field-light"
        />
        <input
          id="register-company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company or lab (optional)"
          aria-label="Company or lab (optional)"
          autoComplete="organization"
          maxLength={200}
          className="input-field-light"
        />
        <select
          id="register-heard-about"
          value={heardAbout}
          onChange={(e) => setHeardAbout(e.target.value)}
          aria-label="How did you hear about us? (optional)"
          className={`input-field-light ${heardAbout ? "" : "text-muted"}`}
        >
          <option value="">How did you hear about us? (optional)</option>
          {HEARD_ABOUT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="flex items-start gap-3 text-xs leading-relaxed text-muted">
          <input
            id="register-marketing"
            type="checkbox"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-gold"
          />
          Email me about new compounds and testing results. Unsubscribe any time.
        </label>
        <label className="flex items-center gap-3 text-xs text-muted">
          <input
            id="register-affiliate"
            type="checkbox"
            checked={isAffiliate}
            onChange={(e) => setIsAffiliate(e.target.checked)}
            className="h-4 w-4 accent-gold"
          />
          I have an affiliate invite code
        </label>
        {isAffiliate && (
          <input
            id="register-invite-code"
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="Invite code"
            aria-label="Invite code"
            className="input-field-light font-mono uppercase tracking-widest"
          />
        )}
        {error && (
          <div role="alert" className="border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
            <p>{error}</p>
            {invalidCode && (
              <button
                type="button"
                onClick={handleContinueAsCustomer}
                disabled={submitting}
                className="mt-2 underline disabled:opacity-40"
              >
                Create a customer account instead
              </button>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold-ink disabled:opacity-40"
        >
          {submitting ? "Creating Account..." : "Create Account"}
        </button>
        <p className="text-center text-xs leading-relaxed text-muted">
          By creating an account you confirm you&apos;re 21 or older and agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-gold-ink">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy-policy" className="underline underline-offset-2 hover:text-gold-ink">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-gold-ink hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function RegisterClient() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
