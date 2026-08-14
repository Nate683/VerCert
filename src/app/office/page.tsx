// VeriCert Executive Office
// Ryan Robson, President & Co-Founder

import type { Metadata } from "next";
import { ExecutiveTerminal } from "@/components/executive/ExecutiveTerminal";
import { EXECUTIVE_IDENTITY } from "@/lib/executive/identity";

export const metadata: Metadata = {
  title: "Executive Office | VeriCert",
  robots: { index: false, follow: false },
};

export default function OfficePage() {
  const identity = EXECUTIVE_IDENTITY.office;
  return (
    <ExecutiveTerminal
      variant="office"
      realm="office"
      executiveName={identity.name}
      executiveTitle={identity.title}
      terminalName={identity.terminalName}
    />
  );
}
