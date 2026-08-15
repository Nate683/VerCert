import { PolicyPage } from "@/components/PolicyPage";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_POLICIES } from "@/lib/site-content";

export const metadata = buildMetadata({
  title: "Terms of Service | VeriCert",
  description: "The terms governing use of the VeriCert storefront and products.",
  path: "/terms",
});

export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const policies = await getContent("policies", DEFAULT_POLICIES);
  return <PolicyPage heading="Terms of Service" paragraphs={policies.terms} />;
}
