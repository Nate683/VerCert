"use client";

import { useState } from "react";
import type { FaqItem } from "@/lib/site-content";

export default function FaqClient({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-3xl px-6 py-20 lg:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: items.map((faq) => ({
              "@type": "Question",
              name: faq.q,
              acceptedAnswer: { "@type": "Answer", text: faq.a },
            })),
          }),
        }}
      />
      <p className="text-xs uppercase tracking-[0.35em] text-gold">FAQ</p>
      <h1 className="mt-3 font-serif text-4xl text-white">Frequently Asked Questions</h1>

      <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
        {items.map((faq, i) => {
          const open = openIndex === i;
          return (
            <div key={faq.q}>
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-6 text-left"
              >
                <span className="font-serif text-lg text-white">{faq.q}</span>
                <span className={`text-xl text-gold transition-transform ${open ? "rotate-45" : ""}`}>
                  +
                </span>
              </button>
              {open && (
                <p className="pb-6 text-sm leading-relaxed text-white/60">{faq.a}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
