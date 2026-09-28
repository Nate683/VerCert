"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { PRODUCT_IMAGE_PX } from "@/lib/products/images";
import { VialGlyph } from "./VialGlyph";

// Product imagery with a hover magnifier on pointer devices and a full-screen
// lightbox on click. The magnifier tracks the cursor by moving the image's
// transform-origin, which keeps whatever the customer is pointing at under the
// cursor as it scales.
//
// The main photo is the first of mainSources that loads — a fallback chain,
// so only one of them is ever shown, never as extra gallery images. Gallery
// images follow it. Anything that fails to load drops out; with nothing left
// it shows the placeholder. Photos sit contained and padded on a light well.
export function ProductGallery({
  name,
  alt,
  mainSources,
  galleryImageUrls = [],
}: {
  name: string;
  alt: string;
  mainSources: string[];
  galleryImageUrls?: string[];
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const main = mainSources.find((url) => !failed.has(url));
  const images = [...new Set([main, ...galleryImageUrls])].filter(
    (url): url is string => Boolean(url) && !failed.has(url!)
  );
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const [zooming, setZooming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const current = images[Math.min(active, images.length - 1)];

  // Only the image on screen resets the frame; a thumbnail failing in the
  // background must not blank a photo that has already loaded.
  const markFailed = useCallback(
    (url: string) => {
      setFailed((prev) => new Set(prev).add(url));
      if (url === current) {
        setActive(0);
        setLoaded(false);
      }
    },
    [current]
  );

  // A server-rendered <img> can finish (or fail) before React attaches its
  // handlers, and then neither event ever reaches us — so check on mount.
  useEffect(() => {
    const img = imgRef.current;
    if (!current || !img?.complete) return;
    if (img.naturalWidth > 0) setLoaded(true);
    else markFailed(current);
  }, [current, markFailed]);

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
        className="group relative aspect-square w-full cursor-zoom-in overflow-hidden border border-hairline bg-paper"
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
          ref={imgRef}
          key={current}
          src={current}
          alt={alt}
          width={PRODUCT_IMAGE_PX}
          height={PRODUCT_IMAGE_PX}
          priority
          sizes="(min-width: 1024px) 58vw, 100vw"
          onLoad={() => setLoaded(true)}
          onError={() => markFailed(current)}
          className={`h-full w-full object-contain object-center p-[8%] transition-[transform,opacity] duration-300 ease-out ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
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
              aria-current={current === url}
              className={`relative h-16 w-16 shrink-0 overflow-hidden border bg-paper transition-colors ${
                current === url ? "border-gold" : "border-hairline hover:border-control"
              }`}
            >
              <Image
                src={url}
                alt={alt}
                width={64}
                height={64}
                onError={() => markFailed(url)}
                className="h-full w-full object-contain p-1"
              />
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
            className="relative flex h-[85vh] w-full max-w-4xl items-center justify-center bg-paper p-[4%]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={current}
              alt={alt}
              width={PRODUCT_IMAGE_PX * 2}
              height={PRODUCT_IMAGE_PX * 2}
              sizes="100vw"
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
