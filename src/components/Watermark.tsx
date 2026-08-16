import Image from "next/image";

// Large, low-opacity V-mark placed in a corner of hero/section backgrounds
// for subtle brand texture. Purely decorative — hidden from assistive tech.
export function Watermark({
  className = "-right-16 -top-16 h-80 w-80",
}: {
  className?: string;
}) {
  return (
    <Image
      src="/icon.png"
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      className={`v-watermark ${className}`}
    />
  );
}
