import Image from "next/image";
import type { ReactNode } from "react";

// The white content area of a short centred page (sign-in, order status) with two oversized emblem watermarks, in
// the homepage hero's relationship: the authentic gray emblem (public/VeriCert-Emblem-Gray.svg, the hero's file)
// cropped into the upper-left corner, lighter, and into the lower-right, larger and more present.
//
// Watermark sizes were raised ~1.5× on tablet/desktop (~1.25× on phones). Opacity was lowered at the same time
// (upper-left 4% → 3%, lower-right 6% → 4.5%) so the larger shapes read as faint as the smaller ones did: a bigger
// shape at the same opacity puts more gray on the page and reads heavier.
//
// This wrapper is the white area between header and footer: it clips both emblems (overflow-hidden), so neither
// reaches the header or footer and nothing scrolls sideways. The emblems are decorative — behind the content, no
// pointer events, hidden from assistive tech.
//
// VERTICAL POSITION — `above` is the tunable number: the share of the area's free vertical space placed ABOVE the
// content (0.5 = exactly centred, lower = higher on the page, 0 = top). It works through two flex spacers with
// zero basis, so when the content is taller than the area there is no free space and no extra height is added.
export function CornerWatermarks({ children, above = 0.5 }: { children: ReactNode; above?: number }) {
  return (
    <div className="relative isolate flex min-h-[calc(100svh-11rem)] flex-col overflow-hidden bg-paper">
      <Image
        src="/VeriCert-Emblem-Gray.svg"
        alt=""
        aria-hidden="true"
        width={312}
        height={345}
        unoptimized
        className="pointer-events-none absolute top-0 left-0 -z-10 h-auto w-[300px] max-w-none -translate-x-[42%] -translate-y-[30%] select-none opacity-[0.03] sm:w-[510px] lg:w-[645px]"
      />
      <Image
        src="/VeriCert-Emblem-Gray.svg"
        alt=""
        aria-hidden="true"
        width={312}
        height={345}
        unoptimized
        className="pointer-events-none absolute right-0 bottom-0 -z-10 h-auto w-[375px] max-w-none translate-x-[38%] translate-y-[24%] select-none opacity-[0.045] sm:w-[660px] lg:w-[870px]"
      />
      <div aria-hidden="true" className="min-h-0 basis-0" style={{ flexGrow: above }} />
      {children}
      <div aria-hidden="true" className="min-h-0 basis-0" style={{ flexGrow: 1 - above }} />
    </div>
  );
}
