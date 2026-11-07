import { VialGlyph } from "./VialGlyph";

// Owner's list of November 7 2026 (with the owner's same-day wording changes to
// 01, 04, 09 and 10): exactly these twelve, in this order.
const ITEMS = [
  "EVERY LOT WILL BE INDEPENDENTLY TESTED",
  "99.0% MINIMUM PURITY RELEASE STANDARD",
  "INDEPENDENT LABORATORY CERTIFICATE VERIFICATION",
  "ELITE TESTING PROTOCOL FOR EVERY PRODUCTION LOT",
  "STERILITY & ENDOTOXIN TESTING",
  "HEAVY METALS & FENTANYL SCREENING",
  "TFA & RESIDUAL SOLVENTS ANALYSIS",
  "IDENTITY, PURITY & QUANTITY VERIFICATION",
  "LOT-SPECIFIC CERTIFICATES OF ANALYSIS",
  "COLD STORAGE PRIOR TO DISPATCH",
  "TEMPERATURE-CONSCIOUS PROTECTIVE PACKAGING",
  "U.S.-BASED CUSTOMER SERVICE & ORDER SUPPORT",
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
