import { NextResponse } from "next/server";
import { listProducts } from "@/lib/products";
import { toCatalogEntry } from "@/lib/catalog";

export const dynamic = "force-dynamic";

// The slim catalog behind header search. Fetched once per browser session and
// held in memory, so search results appear as the customer types rather than
// after a request per keystroke. It carries prices, which are for signed-in
// customers only (the proxy gates this route), so it's cached in that
// customer's browser and never by a shared cache.
export async function GET() {
  const products = await listProducts();
  return NextResponse.json(
    { entries: products.map(toCatalogEntry) },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
