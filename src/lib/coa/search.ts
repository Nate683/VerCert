import type { PublicCertificate } from "./types";

// The one certificate search, used by the header's VERIFY BEFORE YOU BUY panel and the Every Lot Certified search
// on /how-we-test (both through /api/verify/search). Pure; runs on the server over published records only.
//
// Matches compound names, product aliases, SKU, strength and lot numbers, with partial matching and tolerance for
// small spelling mistakes. Results are grouped:
//   exact   — the lot number typed exactly (any age: old certificates stay reachable by exact lot number)
//   current — lots currently sold
//   recent  — approved lots not currently sold, issued within the last 12 months (shown on request)
// Older certificates only come back for an exact lot number. Nothing is deleted after 12 months.

export type Searchable = PublicCertificate & { aliases: string[] };

export type SearchResult = {
  query: string;
  exact: PublicCertificate[];
  current: PublicCertificate[];
  recent: PublicCertificate[];
  suggestions: string[];
};

const compact = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const words = (s: string) => s.toLowerCase().normalize("NFKD").split(/[^a-z0-9]+/).filter(Boolean);

// Damerau–Levenshtein (optimal string alignment) distance, capped for speed.
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const tolerance = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

// How well one query token matches one certificate: 0 = no match; higher is better.
function tokenScore(token: string, item: Searchable): number {
  const t = compact(token);
  if (!t) return 1;
  const names = [item.compoundName, ...item.aliases, item.productSlug ?? ""].filter(Boolean);
  let best = 0;
  for (const name of names) {
    const c = compact(name);
    if (c === t) best = Math.max(best, 100);
    else if (c.startsWith(t) && t.length >= 2) best = Math.max(best, 80);
    else if (c.includes(t) && t.length >= 3) best = Math.max(best, 60);
    for (const w of words(name)) {
      if (w === t) best = Math.max(best, 90);
      else if (w.startsWith(t) && t.length >= 2) best = Math.max(best, 70);
      else if (t.length >= 4 && editDistance(t, w, 2) <= tolerance(t.length)) best = Math.max(best, 40);
    }
    if (t.length >= 4 && editDistance(t, c, 2) <= tolerance(t.length)) best = Math.max(best, 45);
  }
  if (item.sizeLabel) {
    const s = compact(item.sizeLabel);
    if (s === t || s === `${t}mg`) best = Math.max(best, 85);
  }
  if (item.sku) {
    const k = compact(item.sku);
    if (k === t) best = Math.max(best, 100);
    else if (k.includes(t) && t.length >= 3) best = Math.max(best, 55);
  }
  const lot = compact(item.lotNumber);
  if (lot === t) best = Math.max(best, 100);
  else if (lot.startsWith(t) && t.length >= 3) best = Math.max(best, 65);
  return best;
}

function cutoffDate(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

const byCompound = (a: PublicCertificate, b: PublicCertificate) =>
  a.compoundName.localeCompare(b.compoundName) ||
  (a.sizeLabel ?? "").localeCompare(b.sizeLabel ?? "", undefined, { numeric: true }) ||
  (b.issuedOn ?? "").localeCompare(a.issuedOn ?? "") ||
  a.lotNumber.localeCompare(b.lotNumber);

const strip = ({ aliases: _a, ...cert }: Searchable): PublicCertificate => { void _a; return cert; };

export function searchCertificates(raw: string, items: Searchable[], today: string): SearchResult {
  const query = raw.trim().slice(0, 80);
  const empty: SearchResult = { query, exact: [], current: [], recent: [], suggestions: [] };
  if (compact(query).length < 2) return empty;

  const q = compact(query);
  const exact = items.filter((i) => compact(i.lotNumber) === q);
  // Allow "bpc 157 10mg", "BPC-157 10 mg", "bpc157": tokens AND-matched, with the whole query also tried as one.
  const tokens = query.split(/\s+/).filter(Boolean);
  const scored = items
    .map((item) => {
      const whole = tokenScore(query, item);
      const each = tokens.map((t) => tokenScore(t, item));
      const andScore = each.every((s) => s > 0) ? each.reduce((a, b) => a + b, 0) / each.length : 0;
      // "10 mg" splits into "10" and "mg"; join number+unit pairs before giving up.
      const joined = query.replace(/(\d)\s+mg\b/gi, "$1mg").split(/\s+/).filter(Boolean).map((t) => tokenScore(t, item));
      const joinedScore = joined.every((s) => s > 0) ? joined.reduce((a, b) => a + b, 0) / joined.length : 0;
      return { item, score: Math.max(whole, andScore, joinedScore) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || byCompound(a.item, b.item));

  const cutoff = cutoffDate(today);
  const exactIds = new Set(exact.map((e) => e.id));
  const current = scored.filter((s) => s.item.availability === "available" && !exactIds.has(s.item.id)).map((s) => strip(s.item)).sort(byCompound);
  const recent = scored
    .filter((s) => s.item.availability !== "available" && !exactIds.has(s.item.id) && (s.item.issuedOn ?? s.item.testedOn ?? "") >= cutoff)
    .map((s) => strip(s.item))
    .sort(byCompound);

  const suggestions: string[] = [];
  for (const { item } of scored) {
    const label = `${item.compoundName}${item.sizeLabel ? ` ${item.sizeLabel}` : ""}`;
    if (!suggestions.includes(label)) suggestions.push(label);
    if (suggestions.length >= 6) break;
  }
  return { query, exact: exact.map(strip).sort(byCompound), current, recent, suggestions };
}
