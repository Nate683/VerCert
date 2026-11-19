import { NextResponse } from "next/server";
import { InventoryError } from "@/lib/inventory";

// Shared answers for the Stage 3 Executive Office routes.
export const unauthorized = () => NextResponse.json({ error: "Not authenticated." }, { status: 401 });
export const notFound = (what = "Order") => NextResponse.json({ error: `${what} not found.` }, { status: 404 });
export const noStore = { headers: { "Cache-Control": "private, no-store" } };

// A refusal from the database functions (insufficient stock, invalid state, duplicate…) as a JSON error; anything
// else is a real failure and is re-thrown for withApiErrorHandling.
export function inventoryErrorResponse(err: unknown): NextResponse {
  if (err instanceof InventoryError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  throw err;
}
