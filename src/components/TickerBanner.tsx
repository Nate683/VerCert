import { VialGlyph } from "./VialGlyph";

const ITEMS = [
  "COA on every lot",
  "Tracked shipping on every order",
  "Third-party HPLC-MS verified",
];

// The track is rendered twice back to back and translated by exactly -50%, so
// the second copy lands where the first began and the loop has no seam. The
// duplicate is aria-hidden — a screen reader should hear the list once.
function Run({ hidden = false }: { hidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {ITEMS.map((item) => (
        <span key={item} className="flex items-center whitespace-nowrap">
          <span className="px-6 text-[11px] uppercase tracking-[0.22em] text-white/70">
            {item}
          </span>
          <VialGlyph className="h-3 w-3 shrink-0 text-gold/50" />
        </span>
      ))}
    </div>
  );
}

export function TickerBanner() {
  return (
    <div className="ticker relative overflow-hidden border-b border-gold/10 bg-navy-deep py-2">
      <div className="ticker-track flex w-max">
        <Run />
        <Run hidden />
      </div>
    </div>
  );
}
