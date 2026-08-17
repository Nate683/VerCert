"use client";

import Link from "next/link";
import { useEffect } from "react";

// Every error message says what happened and what to do next — never a bare
// "something went wrong" with no way forward.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-24 text-center lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Error</p>
      <h1 className="mt-3 font-serif text-4xl text-white">This page didn&apos;t load</h1>
      <p className="mt-4 text-sm leading-relaxed text-white/50">
        Something on our end failed while building this page. Nothing you did
        caused it, and no order or cart data was affected. Try again — if it
        keeps happening, send us the reference below and we&apos;ll look into it.
      </p>
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-white/30">Reference: {error.digest}</p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-black transition-colors hover:bg-transparent hover:text-gold"
        >
          Try Again
        </button>
        <Link
          href="/shop"
          className="border border-white/20 px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-white/70 transition-colors hover:border-gold hover:text-gold"
        >
          Back to the Catalog
        </Link>
        <Link
          href="/contact"
          className="border border-white/20 px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-white/70 transition-colors hover:border-gold hover:text-gold"
        >
          Contact Us
        </Link>
      </div>
    </div>
  );
}
