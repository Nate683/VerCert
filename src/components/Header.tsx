"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import Image from "next/image";
import { SearchBox } from "./SearchBox";
import { VerifyButton, VerifyPanel } from "./verify/VerifyHeader";

const NAV_LINKS = [
  { href: "/shop", label: "Shop" },
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
  // The VERIFY BEFORE YOU BUY search panel, keyed to the route the same way, so it closes on navigation.
  const [verifyAt, setVerifyAt] = useState<string | null>(null);
  const verifyOpen = verifyAt === pathname;
  const toggleVerify = () => setVerifyAt(verifyOpen ? null : pathname);

  return (
    <header className="sticky top-0 z-50 border-b border-gold/15 bg-navy/95 backdrop-blur">
      {/* The logo link's fixed height (58.32px, and 64.8px from sm) and this
          padding set the header's height: 73.6px, and 87px from sm. */}
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-[7.15px] sm:gap-4 sm:px-6 sm:py-[10.6px] lg:px-10">
        <Link
          href="/"
          className="flex h-[58.32px] shrink-0 items-center sm:h-[64.8px] xl:mr-2"
          aria-label="VeriCert home"
        >
          {/* The one-colour gray-and-gold lockup, as a vector. The artwork
              fills 267.05 × 117.88 of its 282 × 135.24 viewBox, so a 57.37px
              box makes the visible logo 50px tall (119.6 × 57.4 box, 113.3 ×
              50 visible). mt-[2.92px] centres the artwork itself: the file has
              2.9px more transparent space below it than above at this size.
              xl:mr-2 puts ≈28px between the artwork's right edge and SHOP.
              -translate-y-[6px] lifts the artwork optically; from xl, where the
              nav labels sit beside it, 10px puts the gap between VeriCert and
              PEPTIDES at about SHOP's centreline. A transform, so the layout
              and header height don't move. */}
          <Image
            src="/VeriCert-Peptides-One-Color-Gray-Gold.svg"
            alt="VeriCert Peptides"
            width={282}
            height={135}
            unoptimized
            priority
            className="mt-[2.92px] h-[57.37px] w-auto -translate-y-[6px] xl:-translate-y-[10px]"
          />
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
          {/* VERIFY BEFORE YOU BUY sits immediately after CONTACT on desktop. Below xl it has its own row (below). */}
          <VerifyButton open={verifyOpen} onToggle={toggleVerify} />
        </nav>

        {/* PRODUCT search (catalog only — a separate component and data source from the certificate search above).
            The catalog is for signed-in customers, so it only appears once someone is signed in; the wrapper stays
            either way to hold the layout. On desktop it is sized to its content: the icon, the whole placeholder
            ("Search name or CAS #") and a little padding — no wider. */}
        <div className="ml-auto hidden w-full max-w-xs md:block xl:ml-2 xl:w-[12.25rem] xl:max-w-none xl:shrink-0">{user && <SearchBox />}</div>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4 md:ml-0">
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
            className="flex min-h-11 items-center px-1 text-[12px] uppercase tracking-[0.12em] text-white/70 transition-colors hover:text-gold sm:text-[13px] sm:tracking-[0.14em]"
          >
            {user ? "Account" : "Sign In"}
          </Link>
          <Link
            href="/cart"
            aria-label={itemCount > 0 ? `Cart, ${itemCount} item(s)` : "Cart"}
            className="relative flex h-11 w-11 items-center justify-center border border-white/15 text-white/80 transition-colors hover:border-gold hover:text-gold"
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
            className="-mr-2 flex h-11 w-11 flex-col items-center justify-center gap-1.5 xl:hidden"
          >
            <span className="h-px w-6 bg-white" />
            <span className="h-px w-6 bg-white" />
            <span className="h-px w-6 bg-white" />
          </button>
        </div>
      </div>

      {/* Below xl the top row is full, so VERIFY BEFORE YOU BUY gets its own slim row inside the header. */}
      <div className="border-t border-white/10 px-4 xl:hidden">
        <VerifyButton open={verifyOpen} onToggle={toggleVerify} compact />
      </div>

      {verifyOpen && <VerifyPanel onClose={() => setVerifyAt(null)} />}

      {menuOpen && (
        <div className="pop-in border-t border-white/10 px-6 py-4 xl:hidden">
          {user && (
            <div className="md:hidden">
              <SearchBox onNavigate={() => setMenuOpen(false)} />
            </div>
          )}
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
