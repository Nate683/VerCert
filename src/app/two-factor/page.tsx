import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTwoFactorChallengeUser } from "@/lib/two-factor/challenge";
import { isTwoFactorEnabled } from "@/lib/two-factor/store";
import { safeNextPath } from "@/lib/safe-next";
import TwoFactorClient from "./TwoFactorClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Two-Factor Authentication | VeriCert",
  robots: { index: false, follow: false },
};

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(typeof rawNext === "string" ? rawNext : null) ?? "/account";

  // Only reachable between a correct password and a finished sign-in.
  const user = await getTwoFactorChallengeUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const mode = (await isTwoFactorEnabled(user.id)) ? "verify" : "enroll";
  return <TwoFactorClient mode={mode} email={user.email} next={next} />;
}
