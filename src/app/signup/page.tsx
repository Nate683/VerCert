import type { Metadata } from "next";
import SignupClient from "./SignupClient";

export const metadata: Metadata = {
  title: "Create an Account | VeriCert",
  description: "Create a VeriCert account to complete a purchase and track your order history.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return <SignupClient />;
}
