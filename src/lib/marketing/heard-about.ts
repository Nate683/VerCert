// Answers to "How did you hear about us?" at registration. A fixed list rather
// than free text: it only feeds referral reporting, and nothing typed here
// could turn into a field we'd rather not hold.
export const HEARD_ABOUT_OPTIONS = [
  { value: "search", label: "Search engine" },
  { value: "colleague", label: "Colleague or lab referral" },
  { value: "affiliate", label: "An affiliate or partner" },
  { value: "social", label: "Social media" },
  { value: "forum", label: "Research forum or community" },
  { value: "conference", label: "Conference or event" },
  { value: "other", label: "Other" },
] as const;

export type HeardAbout = (typeof HEARD_ABOUT_OPTIONS)[number]["value"];

export const HEARD_ABOUT_VALUES = HEARD_ABOUT_OPTIONS.map((option) => option.value) as [
  HeardAbout,
  ...HeardAbout[],
];

export function heardAboutLabel(value: string | undefined): string | undefined {
  return HEARD_ABOUT_OPTIONS.find((option) => option.value === value)?.label;
}
