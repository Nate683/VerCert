import type { Metadata } from "next";
import CartClient from "./CartClient";
import { requireCustomerForPage } from "@/lib/users/current-user";

export const metadata: Metadata = {
  title: "Your Cart | VeriCert",
  robots: { index: false, follow: false },
};

// The cart's items live in this browser (localStorage); its names and prices
// come from /api/catalog, which checks the session too. Signed-in only: a
// session signed out by a password change goes to /register like one with none.
export default async function CartPage() {
  await requireCustomerForPage("/cart");
  return <CartClient />;
}
