import Image from "next/image";
import { VialGlyph } from "./VialGlyph";

// Clean placeholder used until a real product photo is uploaded — dark
// background, gold accent, product name, same aspect ratio as a real photo
// so the layout never shifts once images are added.
function ProductImagePlaceholder({ name }: { name: string }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-black via-black to-white/[0.03]">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, #C9A227 0px, #C9A227 1px, transparent 1px, transparent 28px)",
        }}
        aria-hidden="true"
      />
      <VialGlyph className="h-16 w-16 text-gold/25" />
      <p className="absolute bottom-4 left-4 right-4 text-center font-serif text-sm text-white/40">
        {name}
      </p>
    </div>
  );
}

export function ProductImage({
  src,
  name,
  zoom = false,
  sizes,
}: {
  src?: string;
  name: string;
  zoom?: boolean;
  sizes?: string;
}) {
  return (
    <div className="group relative aspect-square w-full overflow-hidden border border-white/10 bg-white/[0.02]">
      {src ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes={sizes ?? "(min-width: 1024px) 40vw, 100vw"}
          className={
            zoom
              ? "object-cover transition-transform duration-500 ease-out group-hover:scale-125"
              : "object-cover"
          }
        />
      ) : (
        <ProductImagePlaceholder name={name} />
      )}
    </div>
  );
}
