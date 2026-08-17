"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import type { CartItem } from "@/lib/types";

/**
 * One-click reorder. The items arrive already re-priced against the live
 * catalog by the server, and anything that has since been discontinued or had
 * its size retired is named rather than silently dropped.
 */
export function ReorderButton({
  items,
  unavailable,
}: {
  items: CartItem[];
  unavailable: string[];
}) {
  const router = useRouter();
  const { addItem } = useCart();
  const [busy, setBusy] = useState(false);

  if (items.length === 0) {
    return (
      <span className="text-xs uppercase tracking-[0.12em] text-white/30">
        No longer available
      </span>
    );
  }

  function handleReorder() {
    setBusy(true);
    for (const item of items) addItem(item);
    router.push("/cart");
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={handleReorder}
        disabled={busy}
        className="border border-white/20 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-white/70 transition-colors hover:border-gold hover:text-gold disabled:opacity-50"
      >
        {busy ? "Adding…" : "Reorder"}
      </button>
      {unavailable.length > 0 && (
        <p className="mt-1 text-[11px] text-white/35">
          {unavailable.length} item(s) no longer stocked
        </p>
      )}
    </div>
  );
}
