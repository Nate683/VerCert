import { Suspense } from "react";
import Link from "next/link";

export const metadata = { title: "Verify Email | VeriCert", robots: { index: false, follow: false } };

async function VerifyEmailResult({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const success = status === "success";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20 text-center lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Account</p>
      <h1 className="mt-3 font-serif text-3xl text-white">
        {success ? "Email Verified" : "Verification Link Invalid"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-white/50">
        {success
          ? "Thank you — your email address has been verified."
          : "This verification link is invalid or has expired. You can request a new one from your account page."}
      </p>
      <Link
        href="/account"
        className="mt-8 inline-block border border-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black"
      >
        Go to My Account
      </Link>
    </div>
  );
}

export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <VerifyEmailResult searchParams={searchParams} />
    </Suspense>
  );
}
