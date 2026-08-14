// VeriCert Executive Command
// Nate Robson, Founder & CEO

import type { Metadata } from "next";
import { ExecutiveTerminal } from "@/components/executive/ExecutiveTerminal";
import { EXECUTIVE_IDENTITY } from "@/lib/executive/identity";

export const metadata: Metadata = {
  title: "Executive Command | VeriCert",
  robots: { index: false, follow: false },
};

export default function CommandPage() {
  const identity = EXECUTIVE_IDENTITY.command;
  return (
    <ExecutiveTerminal
      variant="command"
      realm="command"
      executiveName={identity.name}
      executiveTitle={identity.title}
      terminalName={identity.terminalName}
    />
  );
}
