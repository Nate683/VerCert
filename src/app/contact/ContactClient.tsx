"use client";

import { useState } from "react";
import type { ContactContent } from "@/lib/site-content";
import { EditableText } from "@/components/EditableText";
import { useExecMode } from "@/lib/exec-mode-context";

// Placeholder values aren't real contact details yet — never show them to
// real visitors, only to an executive in Live Edit Mode (who needs the hint
// to know what to fill in).
function isUnset(value: string): boolean {
  return value.includes("edit in EXEC MODE");
}

export default function ContactClient({ content }: { content: ContactContent }) {
  const { execMode } = useExecMode();
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          subject: data.get("subject"),
          message: data.get("message"),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Could not send your message.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Contact</p>
      <h1 className="mt-3 font-serif text-4xl text-white">Get in Touch</h1>
      <EditableText value={content.intro} as="p" multiline className="mt-4 max-w-xl text-sm leading-relaxed text-white/50" contentKey="contact_page" field="intro" />

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
                <input required name="name" type="text" placeholder="Name" className="input-field" />
                <input required name="email" type="email" placeholder="Email address" className="input-field" />
              </div>
              <input name="subject" type="text" placeholder="Subject" className="input-field" />
              <textarea
                required
                name="message"
                placeholder="Message"
                rows={6}
                className="input-field resize-none"
              />
              {error && (
                <p className="border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="border border-gold bg-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
              >
                {submitting ? "Sending..." : "Send Message"}
              </button>
            </form>
          )}
        </div>

        <div className="space-y-8 border-t border-white/10 pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
          {(execMode || !isUnset(content.email)) && (
            <div>
              <h3 className="text-xs uppercase tracking-[0.2em] text-gold">Email</h3>
              <EditableText value={content.email} as="p" className="mt-2 text-sm text-white/70" contentKey="contact_page" field="email" />
            </div>
          )}
          {(execMode || !isUnset(content.phone)) && (
            <div>
              <h3 className="text-xs uppercase tracking-[0.2em] text-gold">Phone</h3>
              <EditableText value={content.phone} as="p" className="mt-2 text-sm text-white/70" contentKey="contact_page" field="phone" />
            </div>
          )}
          {(execMode || !isUnset(content.address)) && (
            <div>
              <h3 className="text-xs uppercase tracking-[0.2em] text-gold">Address</h3>
              <EditableText value={content.address} as="p" multiline className="mt-2 text-sm text-white/70" contentKey="contact_page" field="address" />
            </div>
          )}
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-gold">Hours</h3>
            <EditableText value={content.hours} as="p" className="mt-2 text-sm text-white/70" contentKey="contact_page" field="hours" />
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-[0.2em] text-gold">Wholesale</h3>
            <EditableText value={content.wholesaleNote} as="p" multiline className="mt-2 text-sm text-white/70" contentKey="contact_page" field="wholesaleNote" />
          </div>
        </div>
      </div>
    </div>
  );
}

