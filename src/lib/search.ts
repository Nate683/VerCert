// Catalog search scoring, shared by the header search box and the /shop
// filter so both find the same products. Pure and import-free.
//
// What a researcher types rarely matches the catalog's punctuation, so names
// and CAS numbers are compared as letters and digits only: "bpc157" finds
// "BPC-157", "mots c" finds "MOTS-c", "300801030" finds "300801-03-0". A
// leading "CAS" / "CAS No." is ignored, and a multi-word query matches when
// every word appears in the name ("cjc ipamorelin").

export type SearchFields = {
  name: string;
  alternateNames?: string[];
  casNumber: string | null;
  category: string | null;
};

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// A blend's CAS field holds one number per compound, with notes:
// "446262-90-4 (CJC-1295, DAC form); 170851-70-4 (Ipamorelin)".
const CAS_PATTERN = /\d{2,7}-\d{2}-\d/g;
function casNumbers(field: string | null): string[] {
  return field ? (field.match(CAS_PATTERN) ?? []).map(compact) : [];
}

export function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^cas(\s*(no\.?|number|#))?[\s:#]*/, "")
    .trim();
}

/** Lower is better; null means no match. */
export function searchScore(fields: SearchFields, rawQuery: string): number | null {
  const query = normalizeQuery(rawQuery);
  const q = compact(query);
  if (!q) return null;

  const names = [fields.name, ...(fields.alternateNames ?? [])].map(compact);
  const cas = casNumbers(fields.casNumber);
  const looksLikeCas = /^[\d\s-]+$/.test(query) && q.length >= 3;

  if (looksLikeCas) {
    if (cas.some((c) => c === q)) return 0;
    if (cas.some((c) => c.startsWith(q))) return 1;
    if (cas.some((c) => c.includes(q))) return 40;
  }

  if (names.some((n) => n.startsWith(q))) return names[0].startsWith(q) ? 2 : 3;

  const words = query.split(/[\s/,+&]+/).map(compact).filter(Boolean);
  if (words.length > 1 && names.some((n) => words.every((w) => n.includes(w)))) return 10;

  const at = names[0].indexOf(q);
  if (at >= 0) return 20 + at;
  if (names.slice(1).some((n) => n.includes(q))) return 30;

  if (!looksLikeCas && q.length >= 3 && cas.some((c) => c.includes(q))) return 40;
  if ((fields.category ?? "").toLowerCase().includes(query)) return 60;
  return null;
}
