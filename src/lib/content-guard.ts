// Copy that implies human use. Product copy and site_content saved from
// /command or Live Edit Mode are rejected if any of these appear.
//
// To extend: add a term to BLOCKED_TERMS. Matching is case-insensitive and
// starts at a word boundary, and a term also catches longer words it begins
// ("inject" catches "injected", "dose" catches "doses"), so list stems.
// A term never matches inside another word ("cycle" doesn't catch "recycle").
export const BLOCKED_TERMS = [
  "reconstitute",
  "reconstitution",
  "inject",
  "subcutaneous",
  "intramuscular",
  "syringe",
  "needle",
  "dose",
  "dosage",
  "dosing",
  "administer",
  "administration",
  "protocol",
  "cycle",
  "stack",
  "titrate",
  "how to use",
  "directions for use",
  "before use",
  "after mixing",
];

// Phrases that contain a blocked term but are legitimate. They're removed
// before matching.
export const ALLOWED_PHRASES = ["Food and Drug Administration"];

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
}

const blockedPattern = new RegExp(`\\b(?:${BLOCKED_TERMS.map(escape).join("|")})\\w*`, "i");
const allowedPattern = new RegExp(ALLOWED_PHRASES.map(escape).join("|"), "gi");

// Fields that hold links or identifiers rather than copy.
export const PRODUCT_NON_COPY_KEYS = ["slug", "batchNumbers", "imageUrl", "imageUrls"];
export const SITE_CONTENT_NON_COPY_KEYS = ["heroImageUrl", "linkHref", "slugs"];

// site_content keys the guard doesn't check. The legal pages have to name
// what's prohibited (e.g. "introduction into the human body by any route"),
// which is exactly the language the blocklist exists to keep out of copy.
export const GUARD_EXEMPT_CONTENT_KEYS = ["policies"];

export type BlockedTermHit = { term: string; path: string };

// Walks every string in `value` (objects and arrays included) and returns the
// first blocked term found, with where it was found ("description",
// "faq_items[2].a"). `skipKeys` excludes fields that aren't copy, e.g. URLs.
export function findBlockedTerm(value: unknown, skipKeys: string[] = [], path = ""): BlockedTermHit | null {
  if (typeof value === "string") {
    const match = value.replace(allowedPattern, " ").match(blockedPattern);
    return match ? { term: match[0], path } : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findBlockedTerm(value[i], skipKeys, `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (skipKeys.includes(key)) continue;
      const hit = findBlockedTerm(child, skipKeys, path ? `${path}.${key}` : key);
      if (hit) return hit;
    }
  }
  return null;
}

export function blockedTermMessage(hit: BlockedTermHit) {
  const where = hit.path ? ` (in ${hit.path})` : "";
  return `"${hit.term}"${where} isn't allowed: it reads as human-use language. Remove it and save again.`;
}
