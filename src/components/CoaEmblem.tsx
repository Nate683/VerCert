import { COA_LOOKUP_ENABLED, coaLookupUrl } from "@/lib/coa-lookup";

// The VeriCert mark (the check-in-circle from the logo) as the way into
// certificate lookup. It replaces the "Verify COA" nav link, so it carries its
// own label for screen readers and a hover title for everyone else. Like
// every lookup it follows lib/coa-lookup.ts: hidden while lookups are off,
// otherwise it opens VeriCert's certificates at the testing laboratory.
export function CoaEmblem({ className = "" }: { className?: string }) {
  if (!COA_LOOKUP_ENABLED) return null;
  return (
    <a
      href={coaLookupUrl("")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Certificates of analysis"
      title="Certificates of analysis"
      className={`flex h-11 w-11 items-center justify-center text-gold transition-colors hover:text-white ${className}`}
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-7 w-7" aria-hidden="true">
        <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2.25" />
        <path
          d="M9.5 16.5l4.5 4.5L23.5 10"
          stroke="currentColor"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}
