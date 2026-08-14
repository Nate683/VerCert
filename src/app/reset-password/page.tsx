import type { Metadata } from "next";
import ResetPasswordClient from "./ResetPasswordClient";

export const metadata: Metadata = {
  title: "Choose a New Password | VeriCert",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
