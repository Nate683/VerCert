import { query } from "@/lib/db";

// Server-only. The lots an order was ACTUALLY filled from, for customer-facing pages and emails (Stage 3 final
// corrections). Read from the order's committed allocations — never from the order line's `lotNumber`, which before
// Stage 3 was the product's first listed batch stamped at checkout (an assumption, not the fulfilled stock) and is
// no longer shown to customers. Nothing is returned until stock has been allocated (payment confirmed); before that
// there is no lot to state.
//
// Each line can be filled from several lots. A lot without a VeriCert lot number (e.g. the reconciliation lot, or a
// lot received before its number was assigned) contributes its quantity under `vericertLot: null`, and pages show no
// number for it rather than an internal code.

export type FulfilledLot = { vericertLot: string | null; quantity: number };

export async function getFulfilledLots(orderId: string): Promise<Map<number, FulfilledLot[]>> {
  const rows = await query<{ line_index: number | string; vericert_lot_number: string | null; quantity: number | string }>(
    `SELECT a.line_index, l.vericert_lot_number, SUM(a.quantity)::int AS quantity
       FROM inventory_allocations a JOIN inventory_lots l ON l.id = a.lot_id
      WHERE a.order_id = $1 AND a.state = 'committed'
      GROUP BY a.line_index, l.vericert_lot_number
      ORDER BY a.line_index, l.vericert_lot_number NULLS LAST`,
    [orderId]
  );
  const byLine = new Map<number, FulfilledLot[]>();
  for (const r of rows) {
    const line = Number(r.line_index);
    byLine.set(line, [...(byLine.get(line) ?? []), { vericertLot: r.vericert_lot_number, quantity: Number(r.quantity) }]);
  }
  return byLine;
}

// "lot VC-1" / "lots VC-1 (2), VC-2 (1)" — numbered lots only; empty when none has a VeriCert lot number.
export function describeLots(lots: FulfilledLot[] | undefined): string {
  const numbered = (lots ?? []).filter((l) => l.vericertLot);
  if (numbered.length === 0) return "";
  if (numbered.length === 1) return `lot ${numbered[0].vericertLot}`;
  return `lots ${numbered.map((l) => `${l.vericertLot} (${l.quantity})`).join(", ")}`;
}
