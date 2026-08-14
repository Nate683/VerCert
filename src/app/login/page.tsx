import type { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Sign In | VeriCert",
  description: "Sign in to your VeriCert account to check out and view your order history.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginClient />;
}
