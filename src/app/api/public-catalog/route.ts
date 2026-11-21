import { NextResponse } from "next/server";
import { listProducts } from "@/lib/products";
import { isPublicCompound, toPublicCompound } from "@/lib/catalog-public";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// The public compound list for the SIGNED-OUT header search and its View All list (Website Refinements Package 1).
// listProducts() returns exactly what the storefront sells (isOnSale); this projects it to name / alternate names /
// CAS / photo / strengths with their prices — nothing else (lib/catalog-public.ts). The same for every visitor, so a
// shared cache may hold it briefly; a price change shows within a minute.
export const GET = withApiErrorHandling(async () => {
  // The count is computed here, every time, from the eligible products — never stored or hardcoded.
  const compounds = (await listProducts()).filter(isPublicCompound).map(toPublicCompound).filter((c) => c.strengths.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return NextResponse.json(
    { count: compounds.length, compounds },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } }
  );
});
