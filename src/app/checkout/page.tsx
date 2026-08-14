import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?next=/checkout");

  return <CheckoutForm initialEmail={customer.email} initialAddress={customer.savedAddress} />;
}
