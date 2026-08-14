"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { Footer } from "./Footer";

// The executive terminals (/command, /office) render their own dedicated
// shell instead of the storefront header/footer.
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isExecutive = pathname.startsWith("/command") || pathname.startsWith("/office");

  if (isExecutive) return <>{children}</>;

  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
