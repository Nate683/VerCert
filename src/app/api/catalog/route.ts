import { NextResponse } from "next/server";
import { listProducts } from "@/lib/products";
import { toCatalogEntry } from "@/lib/catalog";

export const dynamic = "force-dynamic";

// The slim catalog behind header search. Fetched once per browser session and
// held in memory, so search results appear as the customer types rather than
// after a request per keystroke. Cached briefly at the edge because price and
// stock edits from /command should still surface quickly.
export async function GET() {
  const products = await listProducts();
  return NextResponse.json(
    { entries: products.map(toCatalogEntry) },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
