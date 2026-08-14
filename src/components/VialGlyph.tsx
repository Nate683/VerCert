type Props = {
  className?: string;
};

// Minimal vial/ampoule glyph used as a placeholder product image across the storefront.
export function VialGlyph({ className = "" }: Props) {
  return (
    <svg
      viewBox="0 0 120 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="46" y="8" width="28" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M50 22 L50 54 L30 100 C24 114 34 132 52 132 H68 C86 132 96 114 90 100 L70 54 L70 22"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <line x1="34" y1="98" x2="86" y2="98" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <line x1="42" y1="112" x2="78" y2="112" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
