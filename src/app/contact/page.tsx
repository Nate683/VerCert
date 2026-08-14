import ContactClient from "./ContactClient";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Contact | VeriCert",
  description: "Get in touch with VeriCert about orders, certificates of analysis, or wholesale research accounts.",
  path: "/contact",
});

export default function ContactPage() {
  return <ContactClient />;
}
