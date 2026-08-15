import { PolicyPage } from "@/components/PolicyPage";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_POLICIES } from "@/lib/site-content";

export const metadata = buildMetadata({
  title: "Privacy Policy | VeriCert",
  description: "How VeriCert collects, uses, and protects customer information.",
  path: "/privacy-policy",
});

export const dynamic = "force-dynamic";

export default async function PrivacyPolicyPage() {
  const policies = await getContent("policies", DEFAULT_POLICIES);
  return <PolicyPage heading="Privacy Policy" paragraphs={policies.privacy} />;
}
