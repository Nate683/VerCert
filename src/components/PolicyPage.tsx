export function PolicyPage({ heading, paragraphs }: { heading: string; paragraphs: string[] }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Legal</p>
      <h1 className="mt-3 font-serif text-4xl text-white">{heading}</h1>
      <div className="mt-10 space-y-4 text-sm leading-relaxed text-white/60">
        {paragraphs.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}
