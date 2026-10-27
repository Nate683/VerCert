import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { getBankTransferDetails } from "@/lib/bank-details";
import { getReferringAffiliate } from "@/lib/affiliates";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?next=/checkout");

  // A customer who signed up through an affiliate's referral link has that
  // affiliate's code applied for them; they can remove or replace it.
  const referrer = await getReferringAffiliate(customer);

  return (
    <CheckoutForm
      initialEmail={customer.email}
      initialAddress={customer.savedAddress}
      bankTransferAvailable={getBankTransferDetails().isConfigured}
      referralPromoCode={referrer ? customer.attribution?.ref?.toUpperCase() : undefined}
    />
  );
}
