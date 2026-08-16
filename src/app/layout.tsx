import type { Metadata } from "next";
import { Playfair_Display, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/SiteChrome";
import { CartProvider } from "@/lib/cart-context";
import { AuthProvider } from "@/lib/auth-context";
import { ExecModeProvider } from "@/lib/exec-mode-context";
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

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
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
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-navy text-white">
        <AuthProvider>
          <ExecModeProvider>
            <CartProvider>
              <SiteChrome saleBanner={saleBanner}>{children}</SiteChrome>
            </CartProvider>
          </ExecModeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

