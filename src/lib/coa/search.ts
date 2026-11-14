import { groupLots, lotKey } from "./chronology";
import type { CertificateGroup, CoaLot, PublicReport } from "./types";

// The one certificate search, used by the header's VERIFY BEFORE YOU BUY panel and the Every Lot Certified search on
// /how-we-test (both through /api/verify/search, both rendering the same component). Pure; runs on the server over
// published, non-synthetic, non-deleted records only (lib/coa/public.ts).
//
// Matches: product name and aliases (including a product's earlier name, kept on its certificates), name + strength,
// SKU, complete or partial VeriCert lot number, complete or partial laboratory report number. Harmless differences in
// capitalization, spacing and punctuation are ignored. Small spelling mistakes are tolerated in product NAMES only —
// never in lot or report numbers, which are matched exactly or by prefix/substring, so a similar lot number is never
// presented as the one typed.
//
// Results are grouped by product + strength: its CURRENT lot and its HISTORICAL lots (lib/coa/chronology.ts), with
// every published report under each lot. When several products, strengths or lots match, all are listed — nothing is
// chosen arbitrarily.

// A published report plus what search matches on. productSlug, aliases and createdAt never leave the server.
export type Searchable = Omit<PublicReport, "testing"> & {
  compoundName: string;
  sizeLabel: string | null;
  sku: string | null;
  productSlug: string | null;
  aliases: string[];
  createdAt: string;
};

// A catalog product strength with no published certificate, built server-side from the active, on-sale products
// (lib/coa/public.ts). Its public row carries compound, strength and SKU only.
export type CatalogCandidate = { compoundName: string; aliases: string[]; productSlug: string; sizeLabel: string | null; sku: string | null };

// One autocomplete row. "certificate" rows are groups in this same response; "catalog" rows are products with no
// published certificate and say so — they never imply anything was tested, verified or approved.
export type Suggestion =
  | { kind: "certificate"; key: string; compoundName: string; sizeLabel: string | null; lotNumbers: string[] }
  | { kind: "catalog"; key: string; compoundName: string; sizeLabel: string | null; sku: string | null };

export type SearchResult = {
  query: string;
  groups: CertificateGroup[];
  exactLot: boolean; // the query is exactly a published lot number
  suggestions: Suggestion[];
};

const MAX_SUGGESTIONS = 8;
const MAX_GROUPS = 12;

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

type Matchable = {
  compoundName: string;
  aliases: string[];
  productSlug: string | null;
  sizeLabel: string | null;
  sku?: string | null;
  lotNumber?: string;
  labReportId?: string | null;
};

// How well one query token matches one item: 0 = no match; higher is better.
function tokenScore(token: string, item: Matchable): number {
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
  // Lot and report numbers: exact, prefix or substring — never approximate.
  for (const id of [item.lotNumber, item.labReportId]) {
    const v = compact(id ?? "");
    if (!v) continue;
    if (v === t) best = Math.max(best, 100);
    else if (v.startsWith(t) && t.length >= 3) best = Math.max(best, 75);
    else if (v.includes(t) && t.length >= 4) best = Math.max(best, 65);
  }
  return best;
}

// The best of: the whole query as one token, every token AND-matched, and number+unit pairs joined ("10 mg").
function queryScore(query: string, item: Matchable): number {
  const whole = tokenScore(query, item);
  const each = query.split(/\s+/).filter(Boolean).map((t) => tokenScore(t, item));
  const andScore = each.every((s) => s > 0) ? each.reduce((a, b) => a + b, 0) / each.length : 0;
  const joined = query.replace(/(\d)\s+mg\b/gi, "$1mg").split(/\s+/).filter(Boolean).map((t) => tokenScore(t, item));
  const joinedScore = joined.every((s) => s > 0) ? joined.reduce((a, b) => a + b, 0) / joined.length : 0;
  return Math.max(whole, andScore, joinedScore);
}

const groupKeyOf = (i: { compoundName: string; sizeLabel: string | null; productSlug: string | null }) =>
  `${i.productSlug ?? compact(i.compoundName)}|${compact(i.sizeLabel ?? "")}`;

// Was the query aimed at a lot/report number (rather than a name)? Then only the matching lots are flagged. A query
// that matches the product's name or an alias (e.g. "kpv", when lot numbers also start "KPV…") is a name search and
// flags nothing.
const isIdMatch = (query: string, item: Matchable) => {
  const q = compact(query);
  const names = [item.compoundName, ...item.aliases, item.productSlug ?? ""].map(compact).filter(Boolean);
  if (names.some((n) => n.startsWith(q))) return false;
  return [item.lotNumber, item.labReportId].some((v) => {
    const c = compact(v ?? "");
    return c && q.length >= 3 && (c === q || c.startsWith(q) || (q.length >= 4 && c.includes(q)));
  });
};

// Builds the customer-facing groups for a set of published reports (also used, with preview reports added, by the
// administrative preview so both render identically).
export function buildGroups(items: Searchable[], lots: CoaLot[], matched?: Map<string, Set<string>>): CertificateGroup[] {
  const byGroup = new Map<string, Searchable[]>();
  for (const i of items) byGroup.set(groupKeyOf(i), [...(byGroup.get(groupKeyOf(i)) ?? []), i]);
  return [...byGroup.entries()].map(([key, rs]) => {
    const { current, historical } = groupLots(rs, lots);
    const toLot = (g: NonNullable<typeof current>) => ({
      lotNumber: g.lotNumber,
      reports: g.reports.map((r) => ({
        id: r.id,
        lotNumber: r.lotNumber,
        laboratoryName: r.laboratoryName,
        labReportId: r.labReportId,
        testedOn: r.testedOn,
        issuedOn: r.issuedOn,
        testing: r.testing,
        pdfUrl: r.pdfUrl,
        verificationUrl: r.verificationUrl,
      })),
    });
    const first = rs[0];
    return {
      key,
      compoundName: first.compoundName,
      sizeLabel: first.sizeLabel,
      sku: rs.find((r) => r.sku)?.sku ?? null,
      current: current ? toLot(current) : null,
      historical: historical.map(toLot),
      matchedLots: [...(matched?.get(key) ?? [])],
    };
  });
}

// `catalog` lists catalog strengths for "no published certificate" suggestions — the same for every visitor.
export function searchCertificates(raw: string, items: Searchable[], lots: CoaLot[], catalog: CatalogCandidate[] = []): SearchResult {
  const query = raw.trim().slice(0, 80);
  const empty: SearchResult = { query, groups: [], exactLot: false, suggestions: [] };
  if (compact(query).length < 2) return empty;
  const q = compact(query);

  const scored = items
    .map((item) => ({ item, score: queryScore(query, item) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.item.compoundName.localeCompare(b.item.compoundName));

  // Every group with a match is shown in full (current + historical lots); a lot/report-number query flags the lots it
  // matched so the customer can tell them apart.
  const matched = new Map<string, Set<string>>();
  const order: string[] = [];
  for (const { item } of scored) {
    const key = groupKeyOf(item);
    if (!matched.has(key)) { matched.set(key, new Set()); order.push(key); }
    if (isIdMatch(query, item)) matched.get(key)!.add(item.lotNumber);
  }
  const keep = new Set(order.slice(0, MAX_GROUPS));
  const groups = buildGroups(items.filter((i) => keep.has(groupKeyOf(i))), lots, matched).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const exactLot = items.some((i) => lotKey(i.lotNumber).replace(/[^A-Z0-9]/g, "") === q.toUpperCase());

  const suggestions: Suggestion[] = groups.slice(0, MAX_SUGGESTIONS).map((g) => ({
    kind: "certificate",
    key: g.key,
    compoundName: g.compoundName,
    sizeLabel: g.sizeLabel,
    lotNumbers: [...(g.matchedLots.length ? g.matchedLots : [g.current?.lotNumber].filter((x): x is string => Boolean(x)))],
  }));

  // Catalog strengths with no published certificate at all, after the certificate rows; a strength that has a
  // published certificate is never also offered as "no published certificate".
  const nameKey = (name: string, size: string | null) => `${compact(name)}|${compact(size ?? "")}`;
  const certified = new Set(items.flatMap((i) => [groupKeyOf(i), nameKey(i.compoundName, i.sizeLabel)]));
  const catalogRows = catalog
    .map((c) => ({ c, key: groupKeyOf(c), score: queryScore(query, c) }))
    .filter((r) => r.score > 0 && !certified.has(r.key) && !certified.has(nameKey(r.c.compoundName, r.c.sizeLabel)))
    .sort((a, b) => b.score - a.score || a.c.compoundName.localeCompare(b.c.compoundName) || (a.c.sizeLabel ?? "").localeCompare(b.c.sizeLabel ?? "", undefined, { numeric: true }));
  for (const { c } of catalogRows) {
    if (suggestions.length >= MAX_SUGGESTIONS) break;
    const publicKey = `catalog|${nameKey(c.compoundName, c.sizeLabel)}`;
    if (suggestions.some((s) => s.key === publicKey)) continue;
    suggestions.push({ kind: "catalog", key: publicKey, compoundName: c.compoundName, sizeLabel: c.sizeLabel, sku: c.sku });
  }
  return { query, groups, exactLot, suggestions };
}
