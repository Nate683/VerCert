"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { VialGlyph } from "./VialGlyph";

// Product imagery with a hover magnifier on pointer devices and a full-screen
// lightbox on click. The magnifier tracks the cursor by moving the image's
// transform-origin, which keeps whatever the customer is pointing at under the
// cursor as it scales.
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
  const [lightbox, setLightbox] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const [zooming, setZooming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const step = useCallback(
    (delta: number) => {
      setActive((i) => (i + delta + images.length) % images.length);
      setLoaded(false);
    },
    [images.length]
  );

  useEffect(() => {
    if (!lightbox) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLightbox(false);
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    }
    document.addEventListener("keydown", onKey);
    // Stop the page behind the overlay from scrolling under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [lightbox, step]);

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${x}% ${y}%`);
  }

  if (images.length === 0) {
    return (
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden border border-white/10 bg-gradient-to-br from-black via-black to-white/[0.03]">
        <VialGlyph className="h-20 w-20 text-gold/25" />
        <p className="absolute bottom-5 left-5 right-5 text-center font-serif text-sm text-white/40">
          {name}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        ref={frameRef}
        onMouseEnter={() => setZooming(true)}
        onMouseLeave={() => setZooming(false)}
        onMouseMove={handleMove}
        className="group relative aspect-square w-full cursor-zoom-in overflow-hidden border border-white/10 bg-white/[0.02]"
        onClick={() => setLightbox(true)}
        role="button"
        tabIndex={0}
        aria-label={`Enlarge image of ${name}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setLightbox(true);
          }
        }}
      >
        {!loaded && <div className="skeleton absolute inset-0" />}
        <Image
          key={images[active]}
          src={images[active]}
          alt={name}
          fill
          priority
          sizes="(min-width: 1024px) 45vw, 100vw"
          onLoad={() => setLoaded(true)}
          className="object-cover transition-transform duration-300 ease-out"
          style={{
            transformOrigin: origin,
            transform: zooming ? "scale(2)" : "scale(1)",
          }}
        />
        <span className="pointer-events-none absolute bottom-3 right-3 border border-white/20 bg-black/70 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
          Click to enlarge
        </span>
      </div>

      {images.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => {
                setActive(i);
                setLoaded(false);
              }}
              aria-label={`View image ${i + 1} of ${images.length}`}
              aria-current={active === i}
              className={`relative h-16 w-16 shrink-0 overflow-hidden border transition-colors ${
                active === i ? "border-gold" : "border-white/15 hover:border-white/40"
              }`}
            >
              <Image src={url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${name} — enlarged image`}
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            aria-label="Close"
            className="absolute right-5 top-5 border border-white/20 px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-white/70 transition-colors hover:border-gold hover:text-gold"
          >
            Close
          </button>
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="Previous image"
                className="absolute left-4 border border-white/20 px-3 py-2 text-white/70 transition-colors hover:border-gold hover:text-gold"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="Next image"
                className="absolute right-4 border border-white/20 px-3 py-2 text-white/70 transition-colors hover:border-gold hover:text-gold"
              >
                ›
              </button>
            </>
          )}
          <div
            className="relative h-[85vh] w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={images[active]}
              alt={name}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
