"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { ExecModeToggle } from "./ExecModeToggle";
import { TickerBanner } from "./TickerBanner";
import { PrelaunchBanner } from "./PrelaunchBanner";
import { PRELAUNCH_BANNER_ENABLED } from "@/lib/prelaunch";
import { AgeGate } from "./AgeGate";
import type { SaleBannerContent, ContactContent } from "@/lib/site-content";
import { track } from "@/lib/track-client";
import { useAuth } from "@/lib/auth-context";

// The executive terminals (/command, /office), their sign-in page
// (/executive) and the /hq shared workspace render their own dedicated shell
// instead of the storefront header/footer.
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
  const { user, loading } = useAuth();
  const isExecutive =
    pathname.startsWith("/command") ||
    pathname.startsWith("/office") ||
    pathname.startsWith("/executive") ||
    pathname.startsWith("/hq");

  useEffect(() => {
    if (!isExecutive) track("page_view", { path: pathname });
  }, [pathname, isExecutive]);

  if (isExecutive) return <>{children}</>;

  return (
    <>
      {/* Rendered inside this branch on purpose: the executive terminals
          returned above, so /command, /office, /executive and /hq never see the gate. */}
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
      {/* Announcement for signed-out visitors. Prices are public on the
          homepage (owner's decision, October 18 2026), so it speaks of
          ordering and certificates rather than "full pricing". Hidden while
          the pre-launch banner is on (lib/prelaunch.ts), which replaces it. */}
      {!loading && !user && !PRELAUNCH_BANNER_ENABLED && (
        <div className="bg-navy px-4 py-2 text-center text-xs leading-relaxed text-white/85">
          Ordering and batch certificates are restricted to registered researchers.{" "}
          <Link href="/register" className="text-gold underline underline-offset-2 hover:text-white">
            Create a free account
          </Link>{" "}
          to unlock ordering privileges.
        </div>
      )}
      <TickerBanner />
      <PrelaunchBanner />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer contact={contact} />
    </>
  );
}
