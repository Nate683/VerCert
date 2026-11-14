import { NextResponse } from "next/server";
import { listProducts } from "@/lib/products";
import { toCatalogEntry } from "@/lib/catalog";
import { withCertifiedPurity } from "@/lib/products/certified-purity";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

// The slim catalog behind header search. Fetched once per browser session and
// held in memory, so search results appear as the customer types rather than
// after a request per keystroke. It carries prices, which are for signed-in
// customers only (the proxy gates this route), so it's cached in that
// customer's browser and never by a shared cache.
export async function GET() {
  // The proxy checks only the cookie's signature; this refuses a session signed
  // out by a password change or reset, with the proxy's own signed-out answer.
  if (!(await getCurrentCustomer())) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const products = await withCertifiedPurity(await listProducts());
  return NextResponse.json(
    { entries: products.map(toCatalogEntry) },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
