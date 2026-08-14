"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";

const NAV_LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/coa", label: "COA Verification" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
];

export function Header() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
        <Link href="/" className="flex flex-col leading-none" onClick={() => setMenuOpen(false)}>
          <span className="font-serif text-2xl tracking-wide text-white">
            VERI<span className="text-gold">CERT</span>
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.35em] text-white/40">
            Research Peptides
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm uppercase tracking-[0.15em] transition-colors ${
                  active ? "text-gold" : "text-white/70 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          {user?.role && (
            <Link
              href={`/${user.role}`}
              className="hidden text-sm uppercase tracking-[0.15em] text-gold transition-colors hover:text-white sm:block"
            >
              Executive
            </Link>
          )}
          <Link
            href={user ? "/account" : "/login"}
            className="hidden text-sm uppercase tracking-[0.15em] text-white/70 transition-colors hover:text-gold sm:block"
          >
            {user ? "Account" : "Sign In"}
          </Link>
          <Link
            href="/cart"
            aria-label="Cart"
            className="relative flex items-center justify-center border border-white/15 p-2.5 text-white/80 transition-colors hover:border-gold hover:text-gold"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M3 3h2l.4 2M7 13h10l3.6-8H5.4M7 13L5.4 5M7 13l-1.2 5h13.4M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {itemCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[11px] font-semibold text-black">
                {itemCount}
              </span>
            )}
          </Link>
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex flex-col gap-1.5 lg:hidden"
          >
            <span className="h-px w-6 bg-white" />
            <span className="h-px w-6 bg-white" />
            <span className="h-px w-6 bg-white" />
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="flex flex-col border-t border-white/10 px-6 py-4 lg:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="border-b border-white/5 py-3 text-sm uppercase tracking-[0.15em] text-white/80 last:border-none hover:text-gold"
            >
              {link.label}
            </Link>
          ))}
          {user?.role && (
            <Link
              href={`/${user.role}`}
              onClick={() => setMenuOpen(false)}
              className="border-b border-white/5 py-3 text-sm uppercase tracking-[0.15em] text-gold last:border-none hover:text-white"
            >
              Executive
            </Link>
          )}
          <Link
            href={user ? "/account" : "/login"}
            onClick={() => setMenuOpen(false)}
            className="border-b border-white/5 py-3 text-sm uppercase tracking-[0.15em] text-white/80 last:border-none hover:text-gold"
          >
            {user ? "Account" : "Sign In"}
          </Link>
        </nav>
      )}
    </header>
  );
}
