import FaqClient from "./FaqClient";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "FAQ | VeriCert",
  description: "Answers to common questions about VeriCert's research compounds, testing, and certificates of analysis.",
  path: "/faq",
});

export default function FaqPage() {
  return <FaqClient />;
}
