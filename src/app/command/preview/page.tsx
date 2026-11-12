// PROTOTYPE — Direction A Overview for /command. Same gate as /command: proxy.ts requires a two-factor session for
// everything under /command, and this page admits only the command role. Not linked from anywhere.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LedgerOverview } from "@/components/executive/ledger/LedgerOverview";
import { plexSans } from "@/components/executive/ledger/fonts";
import { EXECUTIVE_IDENTITY } from "@/lib/executive/identity";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview (prototype) | VeriCert", robots: { index: false, follow: false } };

export default async function CommandPreviewPage() {
  const customer = await getCurrentCustomer();
  if (customer?.role !== "command") redirect("/executive");
  const identity = EXECUTIVE_IDENTITY.command;
  return <LedgerOverview variant="command" executiveName={identity.name} executiveTitle={identity.title} fontClass={plexSans.variable} />;
}
