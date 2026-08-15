import { Suspense } from "react";
import Link from "next/link";

export const metadata = { title: "Confirm Email Change | VeriCert", robots: { index: false, follow: false } };

const MESSAGES: Record<string, { title: string; body: string }> = {
  success: {
    title: "Email Updated",
    body: "Your account email address has been updated and verified.",
  },
  conflict: {
    title: "Email Already In Use",
    body: "Another account has claimed that email address since you requested this change. Please try a different address.",
  },
  invalid: {
    title: "Link Invalid",
    body: "This confirmation link is invalid or has expired. You can request the change again from your account page.",
  },
};

async function VerifyEmailChangeResult({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const { title, body } = MESSAGES[status ?? ""] ?? MESSAGES.invalid;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20 text-center lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Account</p>
      <h1 className="mt-3 font-serif text-3xl text-white">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/50">{body}</p>
      <Link
        href="/account"
        className="mt-8 inline-block border border-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black"
      >
        Go to My Account
      </Link>
    </div>
  );
}

export default function VerifyEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <VerifyEmailChangeResult searchParams={searchParams} />
    </Suspense>
  );
}
