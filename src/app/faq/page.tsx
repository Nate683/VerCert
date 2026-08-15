import FaqClient from "./FaqClient";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_FAQ } from "@/lib/site-content";

export const metadata = buildMetadata({
  title: "FAQ | VeriCert",
  description: "Answers to common questions about VeriCert's research compounds, testing, and certificates of analysis.",
  path: "/faq",
});

export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const items = await getContent("faq_items", DEFAULT_FAQ);
  return <FaqClient items={items} />;
}
