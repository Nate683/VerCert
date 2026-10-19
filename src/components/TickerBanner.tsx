import { VialGlyph } from "./VialGlyph";

// Owner-approved phrases only (October 18 2026). Claims such as ISO/IEC 17025
// accreditation, sterility incubation, fentanyl screening, a minimum purity,
// 24-hour dispatch and cloud temperature logging were cut pending
// verification; don't add them back.
const ITEMS = [
  "Independent third-party testing on every batch lot",
  "Certificate of analysis available for every lot number",
  "RP-HPLC purity and mass spectrometry identity confirmation",
  "Cold storage maintained prior to dispatch",
  "Temperature-stable packaging on every shipment",
  "Tracked shipping · Dispatch within 1–2 business days",
];

// The track holds two identical runs and is translated by exactly -50%, so
// the second run lands where the first began and the loop has no seam. Each
// run is at least a full viewport wide (items spread with justify-around), so
// a wide screen never sees the end of the strip as a gap before the loop
// resets. The duplicate is aria-hidden — a screen reader hears the list once.
function Run({ hidden = false }: { hidden?: boolean }) {
  return (
    <div className="ticker-run flex min-w-[100vw] shrink-0 items-center justify-around" aria-hidden={hidden || undefined}>
      {ITEMS.map((item) => (
        <span key={item} className="flex items-center whitespace-nowrap">
          <span className="px-6 text-[11px] uppercase tracking-[0.22em] text-white/70">{item}</span>
          <VialGlyph className="h-3 w-3 shrink-0 text-gold/50" />
        </span>
      ))}
    </div>
  );
}

// #20262D ground to match the footer; cream at 70% on it is 7.1:1.
export function TickerBanner() {
  return (
    <div className="ticker relative overflow-hidden border-b border-gold/10 bg-charcoal py-2">
      <div className="ticker-track flex w-max">
        <Run />
        <Run hidden />
      </div>
    </div>
  );
}
