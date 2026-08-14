// VeriCert Executive Command
// Nate Robson, Founder & CEO

import type { Metadata } from "next";
import { ExecutiveLoginForm } from "@/components/executive/ExecutiveLoginForm";
import { EXECUTIVE_IDENTITY } from "@/lib/executive/identity";

export const metadata: Metadata = {
  title: "Sign In | VeriCert Executive Command",
  robots: { index: false, follow: false },
};

export default function CommandLoginPage() {
  return (
    <ExecutiveLoginForm
      realm="command"
      variant="command"
      terminalName={EXECUTIVE_IDENTITY.command.terminalName}
    />
  );
}
