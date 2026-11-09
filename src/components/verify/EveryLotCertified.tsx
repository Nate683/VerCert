"use client";

import Image from "next/image";
import { useRef } from "react";
import { VerifySearch, type VerifySearchHandle } from "./VerifySearch";

// The Every Lot Certified banner on /how-we-test, with the certificate search permanently beneath it on white.
// The emblem is a button: it focuses the search field (scrolling it into view if needed) — no navigation, no
// modal. The search is the same component and endpoint as the header's VERIFY BEFORE YOU BUY panel, and its
// results flow down the white area below the photograph, never over it.

export function EveryLotCertified() {
  const search = useRef<VerifySearchHandle>(null);
  const searchWrap = useRef<HTMLDivElement>(null);

  function focusSearch() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    searchWrap.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    search.current?.focus();
  }

  return (
    <section aria-labelledby="every-lot-certified" className="border-t border-hairline">
      <div className="relative isolate overflow-hidden">
        {/* every-lot-certified.webp (2169 × 725), served as uploaded: no resizing or re-encoding. */}
        <Image
          src="/every-lot-certified.webp"
          alt=""
          fill
          unoptimized
          sizes="100vw"
          className="-z-10 object-cover object-center"
        />
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-6 py-16 sm:flex-row sm:items-center sm:gap-10 lg:px-10 lg:py-20">
          <button
            type="button"
            onClick={focusSearch}
            aria-label="Search certificates"
            className="shrink-0 rounded-full transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-navy"
          >
            {/* VeriCert-Emblem-Gray-Gold.svg as supplied (viewBox 0 0 303 309). */}
            <Image src="/VeriCert-Emblem-Gray-Gold.svg" alt="" width={303} height={309} unoptimized className="h-24 w-auto sm:h-28" />
          </button>
          <div className="max-w-2xl">
            <h2 id="every-lot-certified" className="font-serif text-3xl text-navy lg:text-4xl">Every Lot Certified</h2>
            <p className="mt-4 text-sm leading-relaxed text-navy/85 sm:text-base">
              Every VeriCert lot approved for sale is supported by independent laboratory documentation. Search by lot
              number or compound to access the original Certificate of Analysis and verify the reported results directly
              with the issuing laboratory.
            </p>
            <p className="mt-4 font-serif text-lg italic text-gold-ink">Don&apos;t just trust our brand. Verify our standards.</p>
          </div>
        </div>
      </div>
      <div ref={searchWrap} className="scroll-mt-32 border-t border-hairline bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
          <VerifySearch ref={search} label="Search certificates by lot number or compound" />
        </div>
      </div>
    </section>
  );
}
