import Image from "next/image";

// Shared wordmark lockup — used in the header and footer so both stay in
// sync if the logo asset is ever swapped.
export function VeriCertLogo({
  className = "h-10 w-auto",
  priority = false,
  tone = "default",
}: {
  className?: string;
  priority?: boolean;
  /** "ink" repaints the lockup navy for light grounds. Size it with an
      explicit height plus aspect-[441/194] — a mask has no intrinsic width,
      so w-auto collapses it to nothing. */
  tone?: "default" | "ink";
}) {
  if (tone === "ink") {
    return (
      <div
        role="img"
        aria-label="VeriCert Research Peptides"
        className={`logo-ink ${className}`}
      />
    );
  }

  return (
    <Image
      src="/logo.png"
      alt="VeriCert Research Peptides"
      width={441}
      height={194}
      className={className}
      priority={priority}
    />
  );
}
