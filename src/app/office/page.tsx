// VeriCert Executive Office
// Ryan Robson, President & Co-Founder

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExecutiveTerminal } from "@/components/executive/ExecutiveTerminal";
import { EXECUTIVE_IDENTITY } from "@/lib/executive/identity";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Executive Office | VeriCert",
  robots: { index: false, follow: false },
};

export default async function OfficePage() {
  const customer = await getCurrentCustomer();
  if (customer?.role !== "office") redirect("/login?next=/office");

  const identity = EXECUTIVE_IDENTITY.office;
  return (
    <ExecutiveTerminal
      variant="office"
      executiveName={identity.name}
      executiveTitle={identity.title}
      terminalName={identity.terminalName}
    />
  );
}
