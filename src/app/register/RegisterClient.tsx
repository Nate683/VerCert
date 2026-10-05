"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { safeNextPath } from "@/lib/safe-next";
import { HEARD_ABOUT_OPTIONS } from "@/lib/marketing/heard-about";
import { PasswordField } from "@/components/PasswordField";

// What an account opens up. Every line is something the site does today;
// keep it that way when editing.
const ACCOUNT_BENEFITS = [
  {
    title: "The full catalog, with pricing",
    body: "Every compound and size with its price, and live stock: you see what's in stock, and how many are left when it runs low.",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    title: "Certificates of analysis",
    body: "Look up the third-party certificate for any lot, and see which lot you'll receive on each product page before you order.",
    icon: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3zM9 12l2 2 4-4",
  },
  {
    title: "Order history and tracking",
    body: "Every order in one place, with payment status and tracking numbers. Reorder anything in one click.",
    icon: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Faster checkout, your data in your hands",
    body: "Save a shipping address for next time. Download everything we hold about you, or delete your account, from your account page.",
    icon: "M5 12l4 4L19 6",
  },
];

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
  const [marketingConsent, setMarketingConsent] = useState(true);
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
          marketingConsent,
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
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16 lg:px-10 lg:py-20">
      <section aria-labelledby="register-heading" className="lg:pt-2">
        <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Research Account</p>
        <h1 id="register-heading" className="mt-3 font-serif text-3xl text-navy sm:text-4xl">
          Open the full catalog
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
          A free account is how you buy from VeriCert. It takes a minute: your name, email and a
          password. No ID, no date of birth. We ask for a shipping address only when you check out.
        </p>

        <ul className="mt-8 space-y-6">
          {ACCOUNT_BENEFITS.map((benefit) => (
            <li key={benefit.title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-hairline text-gold-ink">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d={benefit.icon} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-semibold text-navy">{benefit.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{benefit.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="border border-hairline bg-surface p-5 sm:p-8">
        <h2 className="font-serif text-2xl text-navy">Create your account</h2>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input
              id="register-first-name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              aria-label="First name"
              autoComplete="given-name"
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
          <PasswordField
            id="register-password"
            value={password}
            onChange={setPassword}
            context={{ email, firstName, lastName }}
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
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-gold"
            />
            Send me product updates, restock notices, and offers. You can unsubscribe anytime.
          </label>
          <label className="flex items-center gap-3 py-1.5 text-xs text-muted">
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

        <p className="mt-4 text-center text-xs text-muted">
          Already have an account?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="inline-block py-2 text-gold-ink hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
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
