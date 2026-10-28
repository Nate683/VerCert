import Link from "next/link";
import { REGISTRATION_ACKNOWLEDGMENT } from "@/lib/users/registration";

const POLICY_LINKS: Record<string, string> = {
  "Terms of Sale": "/terms",
  "Privacy Policy": "/privacy-policy",
};

// The stored acknowledgment wording, with the two policy names turned into
// links that open in a new tab — what the person reads is exactly what their
// account records.
export function AcknowledgmentText() {
  return REGISTRATION_ACKNOWLEDGMENT.split(/(Terms of Sale|Privacy Policy)/).map((part, i) =>
    POLICY_LINKS[part] ? (
      <Link
        key={i}
        href={POLICY_LINKS[part]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-gold-ink underline underline-offset-2 hover:text-navy"
      >
        {part}
      </Link>
    ) : (
      part
    )
  );
}
