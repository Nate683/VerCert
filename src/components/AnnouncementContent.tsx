"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { focusAfterScroll } from "@/lib/focus-after-scroll";
import { isInternalAnnouncementLink, parseAnnouncementText, type BannerAnnouncement } from "@/lib/announcements/rules";

const LINK_CLASS = "text-gold underline underline-offset-2 hover:text-white";

// The inside of the announcement bar: gold leading phrase, dash, text (with any inline [label](url) links),
// optional end link. Every field is rendered as React text nodes (escaped), never as HTML, so whatever an admin
// types shows literally. Used by the site's bar (PrelaunchBanner) and the /command previews, so the previews match
// what visitors see.
export function AnnouncementContent({ announcement }: { announcement: BannerAnnouncement }) {
  const { highlight, body, linkUrl, linkLabel } = announcement;
  return (
    <>
      <span className="font-medium uppercase tracking-[0.2em] text-gold">{highlight}</span>{" "}
      <span className="text-gold/60">—</span>{" "}
      {parseAnnouncementText(body).map((piece, i) =>
        "text" in piece ? piece.text : <AnnouncementLink key={i} url={piece.url} label={piece.label} />
      )}
      {linkUrl && linkLabel && (
        <>
          {" "}
          <AnnouncementLink url={linkUrl} label={linkLabel} />
        </>
      )}
    </>
  );
}

function AnnouncementLink({ url, label }: { url: string; label: string }) {
  const pathname = usePathname();
  if (!isInternalAnnouncementLink(url)) {
    return (
      <a href={url} rel="noopener noreferrer" className={LINK_CLASS}>
        {label}
      </a>
    );
  }

  // A link to a section of the page already open (e.g. "/#stay-informed" while on the homepage): scroll to it in
  // place — smoothly unless reduced motion is asked for; scroll-mt on the section clears the sticky header — and
  // move focus to it. Anywhere else the link navigates normally.
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const hash = url.indexOf("#");
    if (hash < 0 || url.slice(0, hash) !== pathname) return;
    let id = url.slice(hash + 1);
    try {
      id = decodeURIComponent(id);
    } catch {
      return;
    }
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(window.history.state, "", `#${id}`);
    // A section holding a form (the footer's Stay Informed signup): once the scroll settles, put the cursor in its
    // email field. Anything else gets focus straight away, as before.
    const field = target.querySelector<HTMLInputElement>('input[type="email"]');
    if (field) focusAfterScroll(field, target);
    else target.focus({ preventScroll: true });
  }

  return (
    <Link href={url} onClick={handleClick} className={LINK_CLASS}>
      {label}
    </Link>
  );
}
