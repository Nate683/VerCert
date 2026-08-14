import type { Metadata } from "next";
import CartClient from "./CartClient";

export const metadata: Metadata = {
  title: "Your Cart | VeriCert",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return <CartClient />;
}
