import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { getHqMember } from "@/lib/hq";
import { HqWorkspace } from "@/components/hq/HqWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "HQ | VeriCert", robots: { index: false, follow: false } };

export default async function HqPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?next=/hq");

  const member = await getHqMember();
  if (!member) {
    return (
      <div className="command-grain flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center text-white">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">HQ</p>
        <h1 className="mt-3 font-serif text-3xl">Not Authorized</h1>
        <p className="mt-3 max-w-sm text-sm text-white/50">
          HQ is available to VeriCert executives and approved affiliates only.
        </p>
      </div>
    );
  }

  return <HqWorkspace member={member} />;
}
