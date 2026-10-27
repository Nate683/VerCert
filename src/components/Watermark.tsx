import Image from "next/image";

// The real VeriCert lockup (public/logo.png, cream on transparent, unless
// `src` names another file of it), shown whole and faint in a corner of dark
// sections as brand texture. Only for dark grounds. Purely decorative, hidden
// from assistive tech. The size and position come from className; the
// opacity lives in .v-watermark.
export function Watermark({
  className = "bottom-6 right-6 w-96",
  src = "/logo.png",
}: {
  className?: string;
  /** Another lockup file of the same 441×194 artwork; an .svg is served as the vector file. */
  src?: string;
}) {
  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={441}
      height={194}
      className={`v-watermark h-auto ${className}`}
    />
  );
}
