"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import type { SaleBannerContent } from "@/lib/site-content";
import { track } from "@/lib/track-client";

// The executive terminals (/command, /office) render their own dedicated
// shell instead of the storefront header/footer.
export function SiteChrome({
  saleBanner,
  children,
}: {
  saleBanner: SaleBannerContent;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isExecutive = pathname.startsWith("/command") || pathname.startsWith("/office");

  useEffect(() => {
    if (!isExecutive) track("page_view", { path: pathname });
  }, [pathname, isExecutive]);

  if (isExecutive) return <>{children}</>;

  return (
    <>
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
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
