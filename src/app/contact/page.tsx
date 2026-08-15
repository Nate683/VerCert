import ContactClient from "./ContactClient";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_CONTACT } from "@/lib/site-content";

export const metadata = buildMetadata({
  title: "Contact | VeriCert",
  description: "Get in touch with VeriCert about orders, certificates of analysis, or wholesale research accounts.",
  path: "/contact",
});

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const content = await getContent("contact_page", DEFAULT_CONTACT);
  return <ContactClient content={content} />;
}
