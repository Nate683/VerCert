import Link from "next/link";
import { unsubscribeFromLink } from "@/lib/marketing/unsubscribe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe | VeriCert", robots: { index: false, follow: false } };

// The link at the foot of every marketing email. Works signed out: the
// signed token in the URL is what authorises the change.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string; email?: string; token?: string }>;
}) {
  const email = await unsubscribeFromLink(await searchParams);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-20 text-center lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Email Preferences</p>
      <h1 className="mt-3 font-serif text-3xl text-navy">{email ? "Unsubscribed" : "Link not recognised"}</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        {email
          ? `${email} won't receive product updates, restock notices, or offers from VeriCert. Order, shipping and account-security emails will still arrive.`
          : "This unsubscribe link is invalid or incomplete. You can turn marketing email off from your account page."}
      </p>
      <p className="mt-6 text-xs text-muted">
        Changed your mind?{" "}
        <Link href="/account" className="text-gold-ink underline underline-offset-4">
          Manage email preferences
        </Link>
      </p>
    </div>
  );
}
