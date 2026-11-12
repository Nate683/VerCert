// PROTOTYPE — Direction A Overview for /office. Same gate as /office: proxy.ts requires a two-factor session for
// everything under /office, and this page admits only the office role. Not linked from anywhere.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LedgerOverview } from "@/components/executive/ledger/LedgerOverview";
import { plexSans } from "@/components/executive/ledger/fonts";
import { EXECUTIVE_IDENTITY } from "@/lib/executive/identity";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview (prototype) | VeriCert", robots: { index: false, follow: false } };

export default async function OfficePreviewPage() {
  const customer = await getCurrentCustomer();
  if (customer?.role !== "office") redirect("/executive");
  const identity = EXECUTIVE_IDENTITY.office;
  return <LedgerOverview variant="office" executiveName={identity.name} executiveTitle={identity.title} fontClass={plexSans.variable} />;
}
