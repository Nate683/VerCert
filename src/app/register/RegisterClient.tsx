"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { safeNextPath } from "@/lib/safe-next";
import { PasswordField } from "@/components/PasswordField";
import { COA_LOOKUP_ENABLED } from "@/lib/coa-lookup";
import { REGISTRATION_ACKNOWLEDGMENT, RESEARCH_CATEGORIES, normalizePhone } from "@/lib/users/registration";

// What an account opens up. Every line is something the site does today;
// keep it that way when editing. The certificate line depends on the batch
// lookup, so it shows only while that lookup is enabled (lib/coa-lookup.ts)
// and the two can never disagree.
const ALL_BENEFITS = [
  {
    title: "The full catalog, with pricing",
    body: "Every compound and size with its price, and live stock: you see what's in stock, and how many are left when it runs low.",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    title: "Certificates of analysis",
    body: "Look up the third-party certificate for any lot, and see which lot you'll receive on each product page before you order.",
    icon: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3zM9 12l2 2 4-4",
    needsCoaLookup: true,
  },
  {
    title: "Order history and tracking",
    body: "Every order in one place, with payment status and tracking numbers. Reorder anything in one click.",
    icon: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Faster checkout, your data in your hands",
    body: "Manage your saved information and account preferences securely through your customer dashboard.",
    icon: "M5 12l4 4L19 6",
  },
];
const ACCOUNT_BENEFITS = ALL_BENEFITS.filter((b) => !b.needsCoaLookup || COA_LOOKUP_ENABLED);

const POLICY_LINKS: Record<string, string> = {
  "Terms of Sale": "/terms",
  "Privacy Policy": "/privacy-policy",
};

// The stored wording, with the two policy names turned into links — what the
// customer reads is exactly what the account records.
function AcknowledgmentText() {
  return REGISTRATION_ACKNOWLEDGMENT.split(/(Terms of Sale|Privacy Policy)/).map((part, i) =>
    POLICY_LINKS[part] ? (
      <Link
        key={i}
        href={POLICY_LINKS[part]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-gold-ink underline underline-offset-2 hover:text-navy"
      >
        {part}
      </Link>
    ) : (
      part
    )
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [researchCategory, setResearchCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  // No affiliate option on the form itself: an invite link
  // (/register?affiliate=1&code=…, also via /signup) is the way in, and only
  // then is the invite code shown.
  const fromInvite = searchParams.get("affiliate") === "1" || Boolean(searchParams.get("code"));
  const [isAffiliate, setIsAffiliate] = useState(fromInvite);
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
          researchCategory,
          phone,
          acknowledgment: acknowledged,
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
    // The same check the server makes, so a typo is caught before the request.
    if (!normalizePhone(phone)) {
      setError("Enter a valid phone number, e.g. (555) 123-4567, or +44 20 7946 0958 outside the US.");
      return;
    }
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
          Create your free VeriCert research account to access our catalog, view available compounds
          and pricing, and manage your research orders.
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
          <div>
            <label htmlFor="register-research-category" className="mb-1.5 block text-xs text-muted">
              Researcher / Business Type*
            </label>
            <select
              id="register-research-category"
              required
              value={researchCategory}
              onChange={(e) => setResearchCategory(e.target.value)}
              className={`input-field-light ${researchCategory ? "" : "text-muted/70"}`}
            >
              <option value="" disabled>
                Select your research category
              </option>
              {RESEARCH_CATEGORIES.map((category) => (
                <option key={category} value={category} className="text-navy">
                  {category}
                </option>
              ))}
            </select>
          </div>
          <input
            id="register-phone"
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
            aria-label="Phone number"
            autoComplete="tel"
            inputMode="tel"
            maxLength={30}
            className="input-field-light"
          />
          <PasswordField
            id="register-password"
            value={password}
            onChange={setPassword}
            context={{ email, firstName, lastName }}
          />
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
          <label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-muted">
            <input
              id="register-acknowledgment"
              type="checkbox"
              required
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
            />
            <span>
              <AcknowledgmentText />
            </span>
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold-ink disabled:opacity-40"
          >
            {submitting ? "Creating Account..." : "Create Account"}
          </button>
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
