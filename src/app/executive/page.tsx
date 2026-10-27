import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/users/current-user";
import ExecutiveSignInClient from "./ExecutiveSignInClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Executive Sign In | VeriCert",
  robots: { index: false, follow: false },
};

// The executives' own way in, kept apart from the storefront's /login and not
// linked from anywhere public. It signs in only the two staff accounts and
// always goes on to two-factor.
export default async function ExecutiveSignInPage() {
  const customer = await getCurrentCustomer();
  if (customer?.role === "command" || customer?.role === "office") redirect(`/${customer.role}`);
  return <ExecutiveSignInClient />;
}
