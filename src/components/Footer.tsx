import Image from "next/image";
import Link from "next/link";
import { NewsletterSignup } from "./NewsletterSignup";
import { Watermark } from "./Watermark";
import { NEWSLETTER_DESCRIPTION, NEWSLETTER_NOTE } from "@/lib/newsletter/consent";
import type { ContactContent } from "@/lib/site-content";

// Placeholder values aren't real contact details yet — don't show them to customers.
function isUnset(value: string): boolean {
  return value.includes("edit in EXEC MODE");
}

export function Footer({ contact }: { contact: ContactContent }) {
  // Email and hours only; the operations address is on the Contact page.
  const contactLines = [
    !isUnset(contact.email) && { label: contact.email, href: `mailto:${contact.email}` },
    contact.hours && { label: contact.hours },
  ].filter((v): v is { label: string; href?: string } => Boolean(v));

  return (
    <footer className="relative overflow-hidden border-t border-gold/15 bg-charcoal">
      <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            {/* The one-colour gold lockup, served as the vector file: 177px
                wide (78px tall), 50% larger than the 52px-tall logo before it.
                Where the column is narrower (around 1024px) it shrinks to fit,
                keeping its proportions. */}
            <Image
              src="/VeriCert-Peptides-One-Color-Gold.svg"
              alt="VeriCert Peptides"
              width={441}
              height={194}
              unoptimized
              className="h-auto w-[177px] max-w-full"
            />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
              Third-party verified research compounds for laboratory use.
              Every batch, certified.
            </p>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-[0.25em] text-gold">Shop</h4>
            <ul className="mt-2 space-y-0.5 text-sm text-white/60">
              <li><Link href="/shop" className="inline-block py-2 hover:text-white">All Products</Link></li>
              <li><Link href="/how-we-test" className="inline-block py-2 hover:text-white">How We Test</Link></li>
              <li><Link href="/cart" className="inline-block py-2 hover:text-white">Cart</Link></li>
              <li><Link href="/order-status" className="inline-block py-2 hover:text-white">Order Status</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-[0.25em] text-gold">Company</h4>
            <ul className="mt-2 space-y-0.5 text-sm text-white/60">
              <li><Link href="/about" className="inline-block py-2 hover:text-white">About</Link></li>
              <li><Link href="/contact" className="inline-block py-2 hover:text-white">Contact</Link></li>
              <li><Link href="/faq" className="inline-block py-2 hover:text-white">FAQ</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-[0.25em] text-gold">Legal</h4>
            <ul className="mt-2 space-y-0.5 text-sm text-white/60">
              <li><Link href="/terms" className="inline-block py-2 hover:text-white">Terms of Sale</Link></li>
              <li><Link href="/privacy-policy" className="inline-block py-2 hover:text-white">Privacy Policy</Link></li>
              <li><Link href="/refund-policy" className="inline-block py-2 hover:text-white">Refund Policy</Link></li>
              <li><Link href="/shipping-policy" className="inline-block py-2 hover:text-white">Shipping Policy</Link></li>
              <li><Link href="/dashboard-policy" className="inline-block py-2 hover:text-white">Dashboard Policy</Link></li>
            </ul>
          </div>

          {contactLines.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-[0.25em] text-gold">Contact</h4>
              <ul className="mt-2 space-y-0.5 text-sm text-white/60">
                {contactLines.map((line) =>
                  line.href ? (
                    <li key={line.label}>
                      <a href={line.href} className="inline-block py-2 hover:text-white">
                        {line.label}
                      </a>
                    </li>
                  ) : (
                    <li key={line.label}>{line.label}</li>
                  )
                )}
              </ul>
            </div>
          )}
        </div>

        {/* The newsletter band runs divider to divider (pb-10 here, no top
            margin on the band below), so the watermark can be centred in it.
            Watermark: the one-colour gray lockup at 90% of its former size
            (45.5rem, capped so it stays clear of the form column on narrower
            desktops); hidden on phones and tablets. */}
        <div className="relative mt-16 border-t border-white/10 py-10">
          <Watermark
            src="/VeriCert-Peptides-One-Color-Gray.svg"
            className="v-watermark-footer right-0 top-1/2 hidden w-[40.95rem] max-w-[calc((100%-28rem)*0.9)] -translate-y-1/2 lg:block"
          />
          <h4 className="text-xs uppercase tracking-[0.25em] text-gold">Stay Informed</h4>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            {NEWSLETTER_DESCRIPTION}
          </p>
          <div className="mt-4">
            <NewsletterSignup />
          </div>
          <p className="mt-3 max-w-sm text-xs text-white/70">{NEWSLETTER_NOTE}</p>
        </div>

        {/* One disclaimer row and one copyright row, nothing else. On the
            #20262D ground: cream at 70% is 7.1:1, links at 60% 5.6:1, gold
            headings 6.3:1 (cream at 50% would be 4.4:1, under 4.5:1). */}
        <div className="border-t border-white/10 pt-8">
          <p className="text-xs leading-relaxed text-white/70">
            All products distributed under the VeriCert Peptides storefront are intended exclusively for
            in-vitro laboratory research, analytical testing, and comparative reagent chemistry applications
            by qualified professional entities. Throughout these operations, the brand moniker &quot;VeriCert
            Peptides&quot; refers to the parent operating entity RKNEA Operations LLC. These chemical matrices
            are not classified as therapeutics, clinical products, active pharmaceutical ingredients,
            diagnostic materials, or dietary additions.
          </p>
          <p className="mt-4 text-xs text-white/70">
            © {new Date().getFullYear()} RKNEA Operations LLC d/b/a VeriCert Peptides. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
