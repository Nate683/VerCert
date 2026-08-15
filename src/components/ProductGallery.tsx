"use client";

import { useState } from "react";
import { ProductImage } from "./ProductImage";

export function ProductGallery({
  name,
  primaryImageUrl,
  galleryImageUrls,
}: {
  name: string;
  primaryImageUrl?: string;
  galleryImageUrls?: string[];
}) {
  const images = [primaryImageUrl, ...(galleryImageUrls ?? [])].filter(
    (url): url is string => Boolean(url)
  );
  const [active, setActive] = useState(0);

  return (
    <div>
      <ProductImage
        src={images[active]}
        name={name}
        zoom
        sizes="(min-width: 1024px) 40vw, 100vw"
      />
      {images.length > 1 && (
        <div className="mt-4 flex gap-3">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(i)}
              className={`h-16 w-16 shrink-0 overflow-hidden border transition-colors ${
                active === i ? "border-gold" : "border-white/15 hover:border-white/40"
              }`}
            >
              <ProductImage src={url} name={name} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
