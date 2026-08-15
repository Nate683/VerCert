import { PolicyPage } from "@/components/PolicyPage";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_POLICIES } from "@/lib/site-content";

export const metadata = buildMetadata({
  title: "Shipping Policy | VeriCert",
  description: "VeriCert's policy on order processing and shipping.",
  path: "/shipping-policy",
});

export const dynamic = "force-dynamic";

export default async function ShippingPolicyPage() {
  const policies = await getContent("policies", DEFAULT_POLICIES);
  return <PolicyPage heading="Shipping Policy" paragraphs={policies.shipping} />;
}
