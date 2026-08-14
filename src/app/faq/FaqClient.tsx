"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "What is VeriCert's intended use for these products?",
    a: "All VeriCert products are intended strictly for in-vitro laboratory research and analytical use by qualified professionals. They are not drugs, foods, dietary supplements, or cosmetics, and are not intended for human or veterinary consumption.",
  },
  {
    q: "How is purity determined and reported?",
    a: "Purity is quantified by reverse-phase HPLC and reported as an area percentage against a certified reference standard. Identity is separately confirmed using mass spectrometry.",
  },
  {
    q: "Where do I find the batch number for my order?",
    a: "The batch number is printed on the vial label and included on your packing slip. Enter it on the COA Verification page to view the independent lab report for that specific lot.",
  },
  {
    q: "Who performs your testing?",
    a: "Testing is conducted by accredited third-party analytical laboratories that have no ownership or affiliation with VeriCert, ensuring the results are independent.",
  },
  {
    q: "What if my batch number doesn't return a result?",
    a: "Double-check the batch number for typos. If the issue persists, contact us with your order number and we will locate the correct certificate.",
  },
  {
    q: "Do you ship internationally?",
    a: "Shipping availability varies by destination and is subject to local regulations governing research chemicals. Contact us before ordering if you are uncertain about your region.",
  },
  {
    q: "Can I request additional documentation, such as a safety data sheet?",
    a: "Yes. Reach out via the Contact page with the product name and batch number, and we will provide any available supporting documentation.",
  },
];

export default function FaqClient() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-3xl px-6 py-20 lg:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((faq) => ({
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
        {FAQS.map((faq, i) => {
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
