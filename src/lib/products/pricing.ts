import type { SizeOption } from "@/lib/types";

// Flat bulk pricing: the highest-qualifying tier's per-unit price applies to
// the whole line, rather than graduated per-unit breakpoints — simplest for
// customers to understand and cheapest to reason about at checkout.
export function resolveUnitPrice(size: SizeOption, quantity: number): number {
  if (!size.bulkTiers || size.bulkTiers.length === 0) return size.priceUsd;

  const qualifying = size.bulkTiers
    .filter((tier) => quantity >= tier.minQuantity)
    .sort((a, b) => b.minQuantity - a.minQuantity)[0];

  return qualifying ? qualifying.priceUsd : size.priceUsd;
}
