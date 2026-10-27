import Link from "next/link";
import { unsubscribeFromLink, unsubscribeNewsletterFromLink } from "@/lib/marketing/unsubscribe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe | VeriCert", robots: { index: false, follow: false } };

// The link at the foot of every marketing email (?u=account) and newsletter
// email (?s=subscriber). Works signed out: the signed token in the URL is
// what authorises the change.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; s?: string; t?: string; email?: string; token?: string }>;
}) {
  const params = await searchParams;
  const newsletter = Boolean(params.s);
  const email = newsletter ? await unsubscribeNewsletterFromLink(params) : await unsubscribeFromLink(params);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-20 text-center lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Email Preferences</p>
      <h1 className="mt-3 font-serif text-3xl text-navy">{email ? "Unsubscribed" : "Link not recognised"}</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        {email
          ? newsletter
            ? `${email} has been removed from the VeriCert newsletter and won't receive offers, product launches or promotions. If you have a VeriCert account, its order, shipping and account-security emails will still arrive.`
            : `${email} won't receive product updates, restock notices, or offers from VeriCert. Order, shipping and account-security emails will still arrive.`
          : newsletter
            ? "This unsubscribe link is invalid or incomplete. Contact us at info@vericertpeptides.com and we'll remove your address."
            : "This unsubscribe link is invalid or incomplete. You can turn marketing email off from your account page."}
      </p>
      {!newsletter && (
        <p className="mt-6 text-xs text-muted">
          Changed your mind?{" "}
          <Link href="/account" className="text-gold-ink underline underline-offset-4">
            Manage email preferences
          </Link>
        </p>
      )}
    </div>
  );
}
