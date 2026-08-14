// VeriCert Executive Office
// Ryan Robson, President & Co-Founder

import type { Metadata } from "next";
import { ExecutiveLoginForm } from "@/components/executive/ExecutiveLoginForm";
import { EXECUTIVE_IDENTITY } from "@/lib/executive/identity";

export const metadata: Metadata = {
  title: "Sign In | VeriCert Executive Office",
  robots: { index: false, follow: false },
};

export default function OfficeLoginPage() {
  return (
    <ExecutiveLoginForm
      realm="office"
      variant="office"
      terminalName={EXECUTIVE_IDENTITY.office.terminalName}
    />
  );
}
