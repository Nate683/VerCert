import Link from "next/link";
import { NewsletterSignup } from "./NewsletterSignup";
import { VeriCertLogo } from "./VeriCertLogo";
import { Watermark } from "./Watermark";
import type { ContactContent } from "@/lib/site-content";

// Placeholder values aren't real contact details yet — don't show them to customers.
function isUnset(value: string): boolean {
  return value.includes("edit in EXEC MODE");
}

export function Footer({ contact }: { contact: ContactContent }) {
  const contactLines = [
    !isUnset(contact.email) && { label: contact.email, href: `mailto:${contact.email}` },
    !isUnset(contact.phone) && { label: contact.phone, href: `tel:${contact.phone.replace(/[^\d+]/g, "")}` },
    !isUnset(contact.address) && { label: contact.address },
    contact.hours && { label: contact.hours },
  ].filter((v): v is { label: string; href?: string } => Boolean(v));

  return (
    <footer className="relative overflow-hidden border-t border-gold/15 bg-black">
      {/* Beside the newsletter row, clear of the disclaimer text. A phone's
          single column has no empty corner for it. */}
      <Watermark className="bottom-40 right-8 hidden w-[26rem] lg:block" />
      <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <VeriCertLogo className="h-9 w-auto" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
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

        <div className="mt-16 border-t border-white/10 pt-10">
          <h4 className="text-xs uppercase tracking-[0.25em] text-gold">Stay Informed</h4>
          <p className="mt-3 max-w-sm text-sm text-white/50">
            Occasional updates on new compounds and testing results. No spam.
          </p>
          <div className="mt-4">
            <NewsletterSignup />
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-8">
          <p className="text-xs leading-relaxed text-white/40">
            All products sold by VeriCert are intended strictly for in-vitro laboratory
            research and analytical use by qualified professionals. They are not drugs,
            foods, dietary supplements, or cosmetics, and are not intended for human or
            veterinary use, diagnosis, treatment, cure, or prevention of any disease.
          </p>
          <p className="mt-4 text-xs text-white/30">
            © {new Date().getFullYear()} VeriCert Research. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
