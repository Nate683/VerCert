import { IBM_Plex_Sans } from "next/font/google";

// Direction A ("Ledger") interface face, loaded only by the pages that use it (the Overview prototype).
// Figures and identifiers use IBM Plex Mono, already loaded site-wide as --font-ledger (app/layout.tsx).
export const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
