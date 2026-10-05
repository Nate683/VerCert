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
// it shows the placeholder. Photos fill a navy frame. With more than one,
// arrows (and a swipe on touch screens) step through them and a thumbnail
// strip below switches the main view; with one, neither appears.
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
  const touchX = useRef<number | null>(null);
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
        className="group relative aspect-square w-full cursor-zoom-in overflow-hidden border border-navy bg-navy"
        onClick={() => setLightbox(true)}
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          // A horizontal swipe steps through the photos on a phone.
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start === null || end === undefined || images.length < 2) return;
          if (Math.abs(end - start) > 40) {
            e.preventDefault();
            step(end < start ? 1 : -1);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Enlarge image of ${name}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setLightbox(true);
          }
          if (e.key === "ArrowRight" && images.length > 1) step(1);
          if (e.key === "ArrowLeft" && images.length > 1) step(-1);
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
          className={`h-full w-full object-cover object-center transition-[transform,opacity] duration-300 ease-out ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          style={{
            transformOrigin: origin,
            transform: zooming ? "scale(2)" : "scale(1)",
          }}
        />
        <span className="pointer-events-none absolute bottom-3 right-3 hidden border border-white/20 bg-black/70 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-white/70 opacity-0 transition-opacity group-hover:opacity-100 md:block">
          Click to enlarge
        </span>
        {images.length > 1 && (
          <>
            {([-1, 1] as const).map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(delta);
                }}
                onMouseEnter={() => setZooming(false)}
                onMouseLeave={() => setZooming(true)}
                onMouseMove={(e) => e.stopPropagation()}
                aria-label={delta < 0 ? "Previous image" : "Next image"}
                className={`absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-white/25 bg-black/60 text-xl text-white/85 backdrop-blur-sm transition-colors hover:border-gold hover:text-gold ${
                  delta < 0 ? "left-3" : "right-3"
                }`}
              >
                <span aria-hidden="true">{delta < 0 ? "‹" : "›"}</span>
              </button>
            ))}
            <span className="pointer-events-none absolute bottom-3 left-3 border border-white/20 bg-black/60 px-2 py-1 font-mono text-[11px] text-white/80">
              {images.indexOf(current) + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1" aria-label="Product photos">
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
              className={`relative h-16 w-16 shrink-0 overflow-hidden border-2 bg-navy transition-[border-color,opacity] sm:h-20 sm:w-20 ${
                current === url ? "border-gold" : "border-transparent opacity-70 hover:border-navy/40 hover:opacity-100"
              }`}
            >
              <Image
                src={url}
                alt={alt}
                width={80}
                height={80}
                onError={() => markFailed(url)}
                className="h-full w-full object-cover"
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
            className="relative flex h-[85vh] w-full max-w-4xl items-center justify-center bg-navy"
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
