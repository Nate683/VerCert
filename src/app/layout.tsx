import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/SiteChrome";
import { CartProvider } from "@/lib/cart-context";
import { AuthProvider } from "@/lib/auth-context";
import { buildMetadata, SITE_NAME } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";
import { getContent, DEFAULT_SALE_BANNER } from "@/lib/site-content";

const displayFont = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  ...buildMetadata({
    title: `${SITE_NAME} | Research Peptides, Verified`,
    path: "/",
  }),
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const saleBanner = await getContent("sale_banner", DEFAULT_SALE_BANNER);

  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-white">
        <AuthProvider>
          <CartProvider>
            <SiteChrome saleBanner={saleBanner}>{children}</SiteChrome>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

