import Image from "next/image";
import type { ReactNode } from "react";

// The white content area of a short centred page (sign-in, order status) with two oversized emblem watermarks, in
// the homepage hero's relationship: the authentic gray emblem (public/VeriCert-Emblem-Gray.svg, the hero's file)
// cropped into the upper-left corner, lighter (4%), and into the lower-right, larger and more present (6%).
//
// This wrapper is the white area between header and footer: it clips both emblems (overflow-hidden), so neither
// reaches the header or footer and nothing scrolls sideways. The emblems are decorative — behind the content, no
// pointer events, hidden from assistive tech. `children` are vertically centred in the area.
export function CornerWatermarks({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-[calc(100svh-11rem)] flex-col justify-center overflow-hidden bg-paper">
      <Image
        src="/VeriCert-Emblem-Gray.svg"
        alt=""
        aria-hidden="true"
        width={312}
        height={345}
        unoptimized
        className="pointer-events-none absolute top-0 left-0 -z-10 h-auto w-[240px] max-w-none -translate-x-[42%] -translate-y-[30%] select-none opacity-4 sm:w-[340px] lg:w-[430px]"
      />
      <Image
        src="/VeriCert-Emblem-Gray.svg"
        alt=""
        aria-hidden="true"
        width={312}
        height={345}
        unoptimized
        className="pointer-events-none absolute right-0 bottom-0 -z-10 h-auto w-[300px] max-w-none translate-x-[38%] translate-y-[24%] select-none opacity-6 sm:w-[440px] lg:w-[580px]"
      />
      {children}
    </div>
  );
}
