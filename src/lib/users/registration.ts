// What the registration form asks beyond name, email and password. Shared by
// the form and the API, so the two can never offer different lists.

// Self-reported: nothing here is checked against credentials or a licence.
export const RESEARCH_CATEGORIES = [
  "Independent Researcher",
  "Laboratory",
  "Academic / Research Institution",
  "Contract Research Organization (CRO)",
  "Biotechnology Research",
  "Pharmaceutical Research",
  "Cosmetic Research",
  "Chemical Supply / Distribution",
  "Other Research Organization",
] as const;

export type ResearchCategory = (typeof RESEARCH_CATEGORIES)[number];

// The statement ticked above Create Account. Each account stores the exact
// wording it accepted, so change it here (never edit stored accounts) if the
// wording ever changes. The form renders "Terms of Sale" and "Privacy Policy"
// in it as links.
export const REGISTRATION_ACKNOWLEDGMENT =
  "I confirm that I am at least 21 years old and understand that VeriCert products are intended exclusively for laboratory research and analytical testing, not for human or veterinary consumption. I agree to the Terms of Sale and Privacy Policy.";

// A phone number as typed, reduced to E.164 (+15551234567), or null when it
// can't be one. Ten digits, or eleven starting with 1, are read as US/Canada;
// anything else must start with + and a country code. Storing the number
// grants nothing: texts go only to accounts with sms_opt_in set.
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    if (digits.startsWith("1")) return /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+${digits}` : null;
    return /^[2-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? `+1${national}` : null;
}
