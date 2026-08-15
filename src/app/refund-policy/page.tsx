import { PolicyPage } from "@/components/PolicyPage";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_POLICIES } from "@/lib/site-content";

export const metadata = buildMetadata({
  title: "Refund Policy | VeriCert",
  description: "VeriCert's policy on refunds, replacements, and quality issues.",
  path: "/refund-policy",
});

export const dynamic = "force-dynamic";

export default async function RefundPolicyPage() {
  const policies = await getContent("policies", DEFAULT_POLICIES);
  return <PolicyPage heading="Refund Policy" paragraphs={policies.refund} />;
}
