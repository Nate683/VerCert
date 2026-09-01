"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { ExecModeToggle } from "./ExecModeToggle";
import { TickerBanner } from "./TickerBanner";
import { AgeGate } from "./AgeGate";
import type { SaleBannerContent, ContactContent } from "@/lib/site-content";
import { track } from "@/lib/track-client";

// The executive terminals (/command, /office) and the /hq shared workspace
// render their own dedicated shell instead of the storefront header/footer.
export function SiteChrome({
  saleBanner,
  contact,
  children,
}: {
  saleBanner: SaleBannerContent;
  contact: ContactContent;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isExecutive =
    pathname.startsWith("/command") || pathname.startsWith("/office") || pathname.startsWith("/hq");

  useEffect(() => {
    if (!isExecutive) track("page_view", { path: pathname });
  }, [pathname, isExecutive]);

  if (isExecutive) return <>{children}</>;

  return (
    <>
      {/* Rendered inside this branch on purpose: the executive terminals
          returned above, so /command, /office and /hq never see the gate. */}
      <AgeGate />
      <ExecModeToggle />
      {saleBanner.active && saleBanner.message && (
        <div className="bg-gold px-4 py-2 text-center text-xs uppercase tracking-[0.15em] text-black">
          {saleBanner.linkHref ? (
            <Link href={saleBanner.linkHref} className="hover:underline">
              {saleBanner.message}
            </Link>
          ) : (
            saleBanner.message
          )}
        </div>
      )}
      <TickerBanner />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer contact={contact} />
    </>
  );
}
