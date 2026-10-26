import type { Metadata } from "next";
import { checkSignInLink } from "@/lib/affiliates";
import { getCurrentCustomer } from "@/lib/users/current-user";
import StartClient from "./StartClient";

export const dynamic = "force-dynamic";
// The token is in this page's address: keep it out of search results and out
// of the Referer header sent to anything the page links to.
export const metadata: Metadata = {
  title: "Partner Sign-In | VeriCert",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Where a texted sign-in link lands. Opening it only checks the link — a
// message app fetching it for a preview must not use it up. The button
// spends it (POST /api/auth/sign-in-link).
export default async function PartnerStartPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw.trim() : "";
  const [state, current] = await Promise.all([checkSignInLink(token), getCurrentCustomer()]);
  return <StartClient token={token} state={state} signedInElsewhere={Boolean(current)} />;
}
