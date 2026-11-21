// Client-safe. Blend compositions (Website Refinements Package 1): each blend STRENGTH has a declared total in mg and
// its ingredients, each a catalog product referenced by its permanent product id (the product's slug — the products
// table's primary key, which a rename never changes). Stored in blend_compositions / blend_components; the database
// enforces the same rules again at commit (scripts/refinements1-sql.mjs).

export type BlendIngredient = {
  componentSlug: string;
  // The component product's CURRENT name, looked up at read time (so a rename shows everywhere at once).
  name: string;
  amountMg: number;
  position: number;
  // Hidden components are shown as text only, never linked.
  componentActive: boolean;
};

export type BlendComposition = {
  strengthId: string;
  blendSlug: string;
  declaredTotalMg: number;
  ingredients: BlendIngredient[];
  version: number;
  updatedAt: string;
  updatedBy: string;
};

// One blend strength as the Executive Office lists it.
export type BlendRow = {
  productSlug: string;
  productName: string;
  productActive: boolean;
  strengthId: string;
  sku: string;
  label: string;
  strengthActive: boolean;
  composition: BlendComposition | null;
  // The pre-package free-text composition on the strength, shown for reference only. Never displayed to customers
  // and never used to fill in the structured record.
  legacyComposition: { name: string; amount: string }[] | null;
  // No structured composition yet: the administrator has to complete it. Customers see no composition section.
  flagged: boolean;
};

// What a customer-facing product page receives for one strength.
export type PublicBlendComposition = {
  totalMg: number;
  ingredients: { name: string; amountMg: number }[];
};

export type CompositionInput = {
  declaredTotalMg: number;
  ingredients: { componentSlug: string; amountMg: number }[];
};

// "50mg", "2.5mg", "0.125mg" — the catalog's own style for strengths ("10mg"), at most 3 decimals.
export function formatMg(n: number): string {
  return `${Number(n.toFixed(3))}mg`;
}

const thousandths = (n: number) => Math.round(n * 1000);
const hasAtMost3Decimals = (n: number) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6;

// Every rule, with administrator-facing wording. An empty list means the composition can be saved.
export function validateComposition(
  input: CompositionInput,
  ctx: { blendSlug: string; productNames: Map<string, string> }
): string[] {
  const errors: string[] = [];
  const total = input.declaredTotalMg;
  if (!Number.isFinite(total) || total <= 0) errors.push("Enter the blend's declared total in mg (more than 0).");
  else if (!hasAtMost3Decimals(total)) errors.push("The declared total can have at most 3 decimal places.");
  if (input.ingredients.length === 0) errors.push("Add at least one ingredient.");
  const seen = new Set<string>();
  input.ingredients.forEach((ing, i) => {
    const row = `Ingredient ${i + 1}`;
    if (!ing.componentSlug) errors.push(`${row}: choose a compound from the catalog.`);
    else if (ing.componentSlug === ctx.blendSlug) errors.push(`${row}: a blend can't list itself as an ingredient.`);
    else if (!ctx.productNames.has(ing.componentSlug)) errors.push(`${row}: "${ing.componentSlug}" isn't a product in the catalog.`);
    else if (seen.has(ing.componentSlug)) errors.push(`${row}: ${ctx.productNames.get(ing.componentSlug)} is already in this blend — each compound can appear once.`);
    if (ing.componentSlug) seen.add(ing.componentSlug);
    if (!Number.isFinite(ing.amountMg) || ing.amountMg <= 0) errors.push(`${row}: the amount must be more than 0 mg.`);
    else if (!hasAtMost3Decimals(ing.amountMg)) errors.push(`${row}: the amount can have at most 3 decimal places.`);
  });
  if (errors.length === 0) {
    const sum = input.ingredients.reduce((a, ing) => a + thousandths(ing.amountMg), 0);
    if (sum !== thousandths(total)) {
      errors.push(`The ingredients add up to ${formatMg(sum / 1000)}, but the declared total is ${formatMg(total)}. They must match.`);
    }
  }
  return errors;
}

// Which products the Blends tab lists: anything named as a blend, or with a composition of either kind.
export function looksLikeBlend(p: { slug: string; name: string }): boolean {
  return /blend/i.test(`${p.slug} ${p.name}`);
}
