import type { Metadata } from "next";
import { Playfair_Display, Inter, JetBrains_Mono, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/SiteChrome";
import { CartProvider } from "@/lib/cart-context";
import { AuthProvider } from "@/lib/auth-context";
import { ExecModeProvider } from "@/lib/exec-mode-context";
import { buildMetadata, SITE_NAME } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-url";
import { getContent, DEFAULT_SALE_BANNER, DEFAULT_CONTACT } from "@/lib/site-content";

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

// Command-only faces. A warmer, wider monospace for the brass figures and a
// clean reading serif for body copy — a 1970s ledger rather than a terminal.
// Not preloaded: the storefront never uses them, so they must not compete for
// bandwidth on the pages that are measured for speed.
const ledgerFont = IBM_Plex_Mono({
  variable: "--font-ledger",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  preload: false,
});

const readFont = Source_Serif_4({
  variable: "--font-read",
  subsets: ["latin"],
  weight: ["400", "600"],
  preload: false,
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
  const contact = await getContent("contact_page", DEFAULT_CONTACT);

  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} ${ledgerFont.variable} ${readFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-navy text-white">
        <AuthProvider>
          <ExecModeProvider>
            <CartProvider>
              <SiteChrome saleBanner={saleBanner} contact={contact}>{children}</SiteChrome>
            </CartProvider>
          </ExecModeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

