"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { PRODUCT_IMAGE_PX } from "@/lib/products/images";
import { VialGlyph } from "./VialGlyph";

// Clean placeholder used until a real product photo exists — dark
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

// Tries each source in order and moves on when one fails to load (a slug
// photo that hasn't been added yet 404s), ending at the placeholder. Photos
// are transparent PNGs, so they sit on a light well with padding round the
// vial and no shadow.
export function ProductImage({
  sources,
  name,
  alt,
  zoom = false,
  sizes,
  priority = false,
}: {
  sources: (string | undefined)[];
  name: string;
  alt?: string;
  zoom?: boolean;
  sizes?: string;
  priority?: boolean;
}) {
  const candidates = sources.filter((src): src is string => Boolean(src));
  const [index, setIndex] = useState(0);
  // A shimmer holds the frame until the photo decodes, so a slow connection
  // shows a loading state rather than an empty square.
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const src = candidates[index];

  function next() {
    setLoaded(false);
    setIndex((i) => i + 1);
  }

  // A server-rendered <img> can finish (or fail) before React attaches its
  // handlers, and then neither event ever reaches us — so check on mount.
  useEffect(() => {
    const img = imgRef.current;
    if (!img?.complete) return;
    if (img.naturalWidth > 0) setLoaded(true);
    else next();
  }, [src]);

  return (
    <div
      className={`group relative aspect-square w-full overflow-hidden border transition-colors ${
        src && loaded ? "border-hairline bg-paper" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      {src ? (
        <>
          {!loaded && <div className="skeleton absolute inset-0" />}
          <Image
            ref={imgRef}
            key={src}
            src={src}
            alt={alt ?? name}
            width={PRODUCT_IMAGE_PX}
            height={PRODUCT_IMAGE_PX}
            priority={priority}
            sizes={sizes ?? "(min-width: 1024px) 40vw, 100vw"}
            onLoad={() => setLoaded(true)}
            onError={next}
            className={`h-full w-full object-contain p-[10%] transition-[transform,opacity] duration-500 ease-out ${
              loaded ? "opacity-100" : "opacity-0"
            } ${zoom ? "group-hover:scale-105" : ""}`}
          />
        </>
      ) : (
        <ProductImagePlaceholder name={name} />
      )}
    </div>
  );
}
