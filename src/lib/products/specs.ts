// Product spec values as the storefront may show them. Unknown values are
// stored as 0 (purity is NOT NULL) or as empty / "TODO …" text, and none of
// those may reach a customer: "0.0% purity" or a bare "CAS" reads as a claim
// about the product. Anything that returns null here is left off the page.

export function specText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && !/^TODO\b/i.test(text) ? text : null;
}

export function formatPurity(percent: number | null | undefined): string | null {
  return typeof percent === "number" && percent > 0 && percent <= 100 ? `${percent.toFixed(1)}%` : null;
}
