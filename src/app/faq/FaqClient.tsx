"use client";

import { useState } from "react";
import type { FaqItem } from "@/lib/site-content";
import { EditableText } from "@/components/EditableText";

export default function FaqClient({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [localItems, setLocalItems] = useState(items);

  async function saveItems(next: FaqItem[]) {
    setLocalItems(next);
    await fetch("/api/executive/inline-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "faq_items", patch: next }),
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-20 lg:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: localItems.map((faq) => ({
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
        {localItems.map((faq, i) => {
          const open = openIndex === i;
          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-6 text-left"
              >
                <EditableText
                  value={faq.q}
                  as="span"
                  className="font-serif text-lg text-white"
                  onSave={(v) => saveItems(localItems.map((item, idx) => (idx === i ? { ...item, q: v } : item)))}
                />
                <span className={`text-xl text-gold transition-transform ${open ? "rotate-45" : ""}`}>
                  +
                </span>
              </button>
              {open && (
                <EditableText
                  value={faq.a}
                  as="p"
                  multiline
                  className="pb-6 text-sm leading-relaxed text-white/60"
                  onSave={(v) => saveItems(localItems.map((item, idx) => (idx === i ? { ...item, a: v } : item)))}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
