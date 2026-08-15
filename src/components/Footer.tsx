import Link from "next/link";
import { NewsletterSignup } from "./NewsletterSignup";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="font-serif text-xl tracking-wide text-white">
              VERI<span className="text-gold">CERT</span>
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
              Third-party verified research compounds for laboratory use.
              Every batch, certified.
            </p>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-[0.25em] text-gold">Shop</h4>
            <ul className="mt-4 space-y-3 text-sm text-white/60">
              <li><Link href="/shop" className="hover:text-white">All Products</Link></li>
              <li><Link href="/coa" className="hover:text-white">COA Verification</Link></li>
              <li><Link href="/cart" className="hover:text-white">Cart</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-[0.25em] text-gold">Company</h4>
            <ul className="mt-4 space-y-3 text-sm text-white/60">
              <li><Link href="/about" className="hover:text-white">About</Link></li>
              <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
              <li><Link href="/faq" className="hover:text-white">FAQ</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-[0.25em] text-gold">Legal</h4>
            <ul className="mt-4 space-y-3 text-sm text-white/60">
              <li><Link href="/terms" className="hover:text-white">Terms of Service</Link></li>
              <li><Link href="/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
              <li><Link href="/refund-policy" className="hover:text-white">Refund Policy</Link></li>
              <li><Link href="/shipping-policy" className="hover:text-white">Shipping Policy</Link></li>
            </ul>
          </div>
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
