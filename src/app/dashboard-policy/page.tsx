import { PolicyPage } from "@/components/PolicyPage";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_POLICIES } from "@/lib/site-content";

export const metadata = buildMetadata({
  title: "Client Dashboard Policy | VeriCert",
  description: "What the VeriCert Peptides account dashboard holds, what you can export, and what deactivating an account removes.",
  path: "/dashboard-policy",
});

export const dynamic = "force-dynamic";

export default async function DashboardPolicyPage() {
  const policies = await getContent("policies", DEFAULT_POLICIES);
  return (
    <PolicyPage
      heading="VeriCert Peptides — Client Dashboard Policy"
      paragraphs={policies.dashboard ?? DEFAULT_POLICIES.dashboard ?? []}
    />
  );
}
