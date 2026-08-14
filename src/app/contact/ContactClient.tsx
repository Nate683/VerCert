"use client";

import { useState } from "react";

export default function ContactClient() {
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Contact</p>
      <h1 className="mt-3 font-serif text-4xl text-white">Get in Touch</h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/50">
        Questions about a certificate of analysis, an order, or wholesale
        research accounts? Send a message below.
      </p>

      <div className="mt-12 grid grid-cols-1 gap-16 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {sent ? (
            <div className="border border-gold/40 p-8 text-center">
              <p className="font-serif text-2xl text-white">Message Sent</p>
              <p className="mt-2 text-sm text-white/50">
                Thank you — our team will respond within one business day.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input required type="text" placeholder="Name" className="input-field" />
                <input required type="email" placeholder="Email address" className="input-field" />
              </div>
              <input type="text" placeholder="Subject" className="input-field" />
              <textarea
                required
                placeholder="Message"
                rows={6}
                className="input-field resize-none"
              />
              <button
                type="submit"
                className="border border-gold bg-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold"
              >
                Send Message
              </button>
            </form>
          )}
        </div>

        <div className="space-y-8 border-t border-white/10 pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-gold">Email</h3>
            <p className="mt-2 text-sm text-white/70">research@vericert.example</p>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-gold">Hours</h3>
            <p className="mt-2 text-sm text-white/70">Monday – Friday, 9am – 5pm ET</p>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-gold">Wholesale</h3>
            <p className="mt-2 text-sm text-white/70">
              Research institutions and laboratories may request volume
              pricing via the form.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
