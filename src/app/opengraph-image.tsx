import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "VeriCert — Research Peptides, Verified";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The card a shared link unfurls into (iMessage, Slack, X, Facebook…): the
// logo on the site's navy, in the brand gold. Every page without its own image
// uses this one (lib/seo.ts).
const NAVY = "#132544";
const NAVY_DEEP = "#0d1626";
const GOLD = "#c9a227";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public/logo.png"), "base64");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
          color: "#ffffff",
          fontFamily: "Arial, sans-serif",
          borderTop: `10px solid ${GOLD}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img */}
        <img src={`data:image/png;base64,${logo}`} width={441 * 1.15} height={194 * 1.15} alt="" />
        <div style={{ display: "flex", width: 160, height: 2, backgroundColor: GOLD, marginTop: 34 }} />
        <div style={{ display: "flex", fontSize: 38, marginTop: 34, color: "#ffffff" }}>
          Research peptides, verified to the batch
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            marginTop: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: GOLD,
          }}
        >
          Certificate of analysis on every lot · Research use only
        </div>
      </div>
    ),
    { ...size }
  );
}
