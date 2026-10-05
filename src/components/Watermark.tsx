import Image from "next/image";

// The real VeriCert lockup (public/logo.png, cream on transparent), shown
// whole and faint in a corner of dark sections as brand texture. Only for
// dark grounds. Purely decorative, hidden from assistive tech. The size and
// position come from className; the opacity lives in .v-watermark.
export function Watermark({
  className = "bottom-6 right-6 w-96",
}: {
  className?: string;
}) {
  return (
    <Image
      src="/logo.png"
      alt=""
      aria-hidden="true"
      width={441}
      height={194}
      className={`v-watermark h-auto ${className}`}
    />
  );
}
