"use client";

import { useState } from "react";
import Link from "next/link";
import type { SignInLinkState } from "@/lib/affiliates/sign-in-links";

const DEAD_LINK_COPY: Record<Exclude<SignInLinkState, "valid">, { title: string; message: string }> = {
  used: {
    title: "Link Already Used",
    message:
      "Each sign-in link works once. If you set a password, sign in with it below. Otherwise, ask VeriCert for a new link.",
  },
  expired: {
    title: "Link Expired",
    message: "Sign-in links work for 7 days. Ask VeriCert for a new one, or sign in with your password.",
  },
  invalid: {
    title: "Link Not Recognized",
    message:
      "This sign-in link isn't valid. It may have been replaced by a newer one — use the most recent link you were sent.",
  },
};

export default function StartClient({
  token,
  state,
  signedInElsewhere,
}: {
  token: string;
  state: SignInLinkState;
  signedInElsewhere: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-in-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "This sign-in link could not be used.");
      // A full load, so the header and everything else pick up the new session.
      window.location.assign(data.next ?? "/partner");
    } catch (err) {
      setError(err instanceof Error ? err.message : "This sign-in link could not be used.");
      setSubmitting(false);
    }
  }

  const dead = state === "valid" ? null : DEAD_LINK_COPY[state];

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-20 text-center lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Partner Portal</p>
      <h1 className="mt-3 font-serif text-3xl text-navy">{dead ? dead.title : "Welcome to VeriCert"}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {dead
          ? dead.message
          : "Your partner portal is ready: your referral code, the orders you drive, and the commission you earn."}
      </p>

      {dead ? (
        <Link
          href="/login?next=/partner"
          className="mt-8 inline-block border border-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-gold-ink transition-colors hover:bg-gold hover:text-black"
        >
          Sign In with a Password
        </Link>
      ) : (
        <>
          <button
            type="button"
            onClick={handleSignIn}
            disabled={submitting}
            className="mt-8 w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold-ink disabled:opacity-40"
          >
            {submitting ? "Signing In..." : "Open My Partner Portal"}
          </button>
          <p className="mt-3 text-xs text-muted">This link works once and signs you in on this device.</p>
          {signedInElsewhere && (
            <p className="mt-2 text-xs text-muted">You&apos;ll be signed out of the account you&apos;re using now.</p>
          )}
          {error && (
            <p role="alert" className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
