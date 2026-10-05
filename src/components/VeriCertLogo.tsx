import Image from "next/image";

// Shared wordmark lockup. Both versions are the real logo files in their own
// colours, never recoloured in code:
// - "dark" (default): public/logo.png, cream on transparent, for the navy
//   header, the black footer and other dark grounds.
// - "light": public/Logo.jpg, navy with a gold check, for white grounds. It
//   has a solid white background, so only place it on pure white (bg-paper);
//   on any other colour it shows as a white box.
export function VeriCertLogo({
  className = "h-10 w-auto",
  priority = false,
  ground = "dark",
}: {
  className?: string;
  priority?: boolean;
  ground?: "dark" | "light";
}) {
  return (
    <Image
      src={ground === "light" ? "/Logo.jpg" : "/logo.png"}
      alt="VeriCert Research Peptides"
      width={441}
      height={194}
      className={className}
      priority={priority}
    />
  );
}
