import type { Metadata } from "next";
import { OrderStatusLookup } from "./OrderStatusLookup";

export const metadata: Metadata = {
  title: "Order Status | VeriCert",
  description: "Check an order's status and payment instructions with its reference code and email — no account needed.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OrderStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const { reference } = await searchParams;
  return <OrderStatusLookup initialReference={reference?.slice(0, 40) ?? ""} />;
}
