import Link from "next/link";
import { CoaQuickLookup } from "@/components/CoaQuickLookup";

export const metadata = {
  title: "Page Not Found | VeriCert",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-28 text-center lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">404</p>
      <h1 className="mt-3 font-serif text-4xl text-white">We can&apos;t find that page</h1>
      <p className="mt-4 text-sm leading-relaxed text-white/50">
        The link may be out of date, or the compound may have been retired from
        the catalog. Here&apos;s where to go instead.
      </p>

      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <Link
          href="/shop"
          className="border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-black transition-colors hover:bg-transparent hover:text-gold"
        >
          Browse the Catalog
        </Link>
        <Link
          href="/contact"
          className="border border-white/20 px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-white/70 transition-colors hover:border-gold hover:text-gold"
        >
          Contact Us
        </Link>
      </div>

      <div className="mt-14 border-t border-white/10 pt-10 text-left">
        <p className="text-xs uppercase tracking-[0.2em] text-gold">
          Looking for a certificate?
        </p>
        <p className="mt-2 text-sm text-white/50">
          Enter the batch number from your vial label.
        </p>
        <div className="mt-4">
          <CoaQuickLookup />
        </div>
      </div>
    </div>
  );
}
