// Legal pages are stored as plain paragraphs (site_content "policies") so
// they stay editable from /command. Two light conventions add structure:
// a paragraph starting "## " is a section heading, and a paragraph whose
// lines all start "- " is a list. Pages with headings get a contents list.

type Block =
  | { kind: "heading"; text: string; id: string }
  | { kind: "list"; items: string[] }
  | { kind: "paragraph"; text: string };

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toBlocks(paragraphs: string[]): Block[] {
  return paragraphs.map((raw): Block => {
    const text = raw.trim();
    if (text.startsWith("## ")) {
      const heading = text.slice(3).trim();
      return { kind: "heading", text: heading, id: slugify(heading) };
    }
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0 && lines.every((l) => l.startsWith("- "))) {
      return { kind: "list", items: lines.map((l) => l.slice(2)) };
    }
    return { kind: "paragraph", text };
  });
}

export function PolicyPage({
  heading,
  paragraphs,
  lastUpdated,
}: {
  heading: string;
  paragraphs: string[];
  lastUpdated?: string;
}) {
  const blocks = toBlocks(paragraphs);
  const sections = blocks.filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading");

  return (
    <div className="mx-auto max-w-3xl px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Legal</p>
      <h1 className="mt-3 font-serif text-4xl text-navy">{heading}</h1>
      {lastUpdated && <p className="mt-3 text-sm text-muted">Last updated {lastUpdated}</p>}

      {sections.length > 2 && (
        <nav aria-label="Contents" className="mt-10 border-y border-hairline py-6">
          <p className="text-xs uppercase tracking-[0.25em] text-navy">Contents</p>
          <ol className="mt-4 gap-x-8 text-sm sm:columns-2">
            {sections.map((s, i) => (
              <li key={s.id} className="break-inside-avoid">
                <a
                  href={`#${s.id}`}
                  className="flex gap-2 py-1.5 text-muted underline-offset-4 transition-colors hover:text-navy hover:underline"
                >
                  <span className="w-5 shrink-0 font-mono text-xs leading-5">{i + 1}.</span>
                  <span>{s.text}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="mt-10 space-y-4 text-sm leading-relaxed text-muted">
        {blocks.map((block, i) => {
          if (block.kind === "heading") {
            const number = sections.indexOf(block) + 1;
            return (
              <h2 key={i} id={block.id} className="scroll-mt-28 pt-6 font-serif text-xl text-navy">
                {sections.length > 2 && <span className="mr-2 font-mono text-sm text-muted">{number}.</span>}
                {block.text}
              </h2>
            );
          }
          if (block.kind === "list") {
            return (
              <ul key={i} className="list-disc space-y-2 pl-5 marker:text-navy/40">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          }
          return <p key={i}>{block.text}</p>;
        })}
      </div>
    </div>
  );
}
