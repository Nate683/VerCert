// VeriCert Executive Command
// Nate Robson, Founder & CEO

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExecutiveTerminal } from "@/components/executive/ExecutiveTerminal";
import { EXECUTIVE_IDENTITY } from "@/lib/executive/identity";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Executive Command | VeriCert",
  robots: { index: false, follow: false },
};

export default async function CommandPage() {
  const customer = await getCurrentCustomer();
  if (customer?.role !== "command") redirect("/login?next=/command");

  const identity = EXECUTIVE_IDENTITY.command;
  return (
    <ExecutiveTerminal
      variant="command"
      executiveName={identity.name}
      executiveTitle={identity.title}
      terminalName={identity.terminalName}
    />
  );
}
