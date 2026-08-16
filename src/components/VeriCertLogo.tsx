import Image from "next/image";

// Shared wordmark lockup — used in the header and footer so both stay in
// sync if the logo asset is ever swapped.
export function VeriCertLogo({
  className = "h-10 w-auto",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
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
