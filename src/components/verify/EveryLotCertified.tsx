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
            {/* The navy-and-gold emblem: VeriCert-Emblem-Navy-Gold.svg, extracted verbatim from
                VeriCert-Peptides-Full-Color-RGB-V2.svg (viewBox 30.01 × 30.52; paths and fills unchanged). */}
            <Image src="/VeriCert-Emblem-Navy-Gold.svg" alt="" width={300} height={305} unoptimized className="h-24 w-auto sm:h-28" />
          </button>
          <div className="max-w-2xl">
            <h2 id="every-lot-certified" className="font-serif text-3xl text-navy lg:text-4xl">Every Lot Certified</h2>
            <p className="mt-4 text-sm leading-relaxed text-navy/85 sm:text-base">
              Every VeriCert lot approved for sale is supported by independent laboratory documentation. Search by lot
              number or compound to access the original Certificate of Analysis and verify the reported results directly
              with the issuing laboratory.
            </p>
            {/* The motto in the body family (Inter), upright and semibold, in the accessible text gold. */}
            <p className="mt-5 font-sans text-base font-semibold leading-snug tracking-[0.01em] text-gold-ink sm:text-lg">
              &ldquo;Don&rsquo;t just trust our brand. Verify our standards.&rdquo;
            </p>
          </div>
        </div>
      </div>
      {/* The search sits just under the photograph, on white (never over the image). Suggestions and results open in
          the normal flow of the page and push the content below down, so nothing is clipped or overlapped; idle, the
          section stays compact. */}
      <div ref={searchWrap} className="scroll-mt-32 border-t border-hairline bg-paper">
        <div className="mx-auto max-w-5xl px-6 pb-2 pt-2.5 sm:pt-3 lg:px-10">
          {/* Desktop only (lg, 1024px+): the whole search — field, suggestions, message and results — is one 710px
              column, centred (about 75% of the 944px column), so everything under the field lines up with it. Below lg
              the layout is unchanged (full column width). */}
          <div className="lg:mx-auto lg:max-w-[710px]">
            <VerifySearch ref={search} label="Search certificates by lot number or compound" />
          </div>
        </div>
      </div>
    </section>
  );
}
