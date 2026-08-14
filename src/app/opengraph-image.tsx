import { ImageResponse } from "next/og";

export const alt = "VeriCert — Research Peptides, Verified";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          backgroundColor: "#000000",
          color: "#ffffff",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 20,
            letterSpacing: 10,
            textTransform: "uppercase",
            color: "#c9a227",
          }}
        >
          Research Use Only
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 96,
            marginTop: 24,
            letterSpacing: 4,
          }}
        >
          VERI<span style={{ color: "#c9a227" }}>CERT</span>
        </div>
        <div
          style={{
            display: "flex",
            width: 140,
            height: 2,
            backgroundColor: "#c9a227",
            marginTop: 28,
            opacity: 0.7,
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 26,
            marginTop: 28,
            color: "rgba(255,255,255,0.6)",
            fontFamily: "Arial, sans-serif",
          }}
        >
          Research Peptides, Verified to the Batch
        </div>
      </div>
    ),
    { ...size }
  );
}
