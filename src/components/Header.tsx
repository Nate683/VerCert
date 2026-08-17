"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { VeriCertLogo } from "./VeriCertLogo";
import { SearchBox } from "./SearchBox";

const NAV_LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/coa", label: "Verify COA" },
  { href: "/how-we-test", label: "How We Test" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const { user } = useAuth();
  // The drawer is only open for the route it was opened on, so any navigation
  // — including a back/forward move — closes it without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const menuOpen = openedAt === pathname;
  const setMenuOpen = (open: boolean) => setOpenedAt(open ? pathname : null);

  return (
    <header className="sticky top-0 z-50 border-b border-gold/15 bg-navy/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4 lg:px-10">
        <Link href="/" className="shrink-0" aria-label="VeriCert home">
          <VeriCertLogo className="h-9 w-auto sm:h-10" priority />
        </Link>

        <nav className="hidden items-center gap-6 xl:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap text-[13px] uppercase tracking-[0.14em] transition-colors ${
                  active ? "text-gold" : "text-white/70 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden w-full max-w-xs md:block">
          <SearchBox />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4 md:ml-0">
          {user?.role && (
            <Link
              href={`/${user.role}`}
              className="hidden text-[13px] uppercase tracking-[0.14em] text-gold transition-colors hover:text-white lg:block"
            >
              Executive
            </Link>
          )}
          <Link
            href={user ? "/account" : "/login"}
            className="hidden text-[13px] uppercase tracking-[0.14em] text-white/70 transition-colors hover:text-gold sm:block"
          >
            {user ? "Account" : "Sign In"}
          </Link>
          <Link
            href="/cart"
            aria-label={itemCount > 0 ? `Cart, ${itemCount} item(s)` : "Cart"}
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
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex flex-col gap-1.5 p-1 xl:hidden"
          >
            <span className="h-px w-6 bg-white" />
            <span className="h-px w-6 bg-white" />
            <span className="h-px w-6 bg-white" />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="pop-in border-t border-white/10 px-6 py-4 xl:hidden">
          <div className="md:hidden">
            <SearchBox onNavigate={() => setMenuOpen(false)} />
          </div>
          <nav className="mt-2 flex flex-col">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="border-b border-white/5 py-3 text-sm uppercase tracking-[0.15em] text-white/80 hover:text-gold"
              >
                {link.label}
              </Link>
            ))}
            {user?.role && (
              <Link
                href={`/${user.role}`}
                onClick={() => setMenuOpen(false)}
                className="border-b border-white/5 py-3 text-sm uppercase tracking-[0.15em] text-gold hover:text-white"
              >
                Executive
              </Link>
            )}
            <Link
              href={user ? "/account" : "/login"}
              onClick={() => setMenuOpen(false)}
              className="py-3 text-sm uppercase tracking-[0.15em] text-white/80 hover:text-gold"
            >
              {user ? "Account" : "Sign In"}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
