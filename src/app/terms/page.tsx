import { PolicyPage } from "@/components/PolicyPage";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_POLICIES } from "@/lib/site-content";

// DRAFT PENDING LEGAL REVIEW — the Terms of Sale text (DEFAULT_POLICIES.terms
// in lib/site-content/defaults.ts, or the "policies" row once edited in
// /command) has not been reviewed by counsel.
export const metadata = buildMetadata({
  title: "Terms of Sale | VeriCert",
  description: "The terms that apply to every order placed with VeriCert Research: eligibility, research-use restrictions, payment, shipping, returns and liability.",
  path: "/terms",
});

export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const policies = await getContent("policies", DEFAULT_POLICIES);
  return (
    <PolicyPage
      heading="Terms of Sale"
      paragraphs={policies.terms}
      lastUpdated={policies.termsUpdated ?? DEFAULT_POLICIES.termsUpdated}
    />
  );
}
