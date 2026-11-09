// The contact form's subject choices. Client-safe: the form renders these, and the API accepts only these
// (lib/validation.ts contactFormSchema), so the dropdown is enforced on the server too.
export const CONTACT_SUBJECTS = [
  "General Inquiry",
  "Order Support",
  "Certificate of Analysis (COA)",
  "Wholesale Research Inquiry",
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];
