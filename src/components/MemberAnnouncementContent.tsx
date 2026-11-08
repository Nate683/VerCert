import Link from "next/link";
import { isInternalAnnouncementLink, type MemberAnnouncement } from "@/lib/announcements/rules";

const LINK_CLASS = "text-gold underline underline-offset-2 hover:text-white";

// The inside of the signed-in announcement bar: gold leading phrase, dash, text, optional link. Every field is
// rendered as a React text node (escaped), never as HTML, so whatever an admin types shows literally. Used by the
// customer-facing bar (PrelaunchBanner) and the /command preview, so the preview matches what customers see.
export function MemberAnnouncementContent({ announcement }: { announcement: MemberAnnouncement }) {
  const { highlight, body, linkUrl, linkLabel } = announcement;
  return (
    <>
      <span className="font-medium uppercase tracking-[0.2em] text-gold">{highlight}</span>{" "}
      <span className="text-gold/60">—</span> {body}
      {linkUrl && linkLabel && (
        <>
          {" "}
          {isInternalAnnouncementLink(linkUrl) ? (
            <Link href={linkUrl} className={LINK_CLASS}>
              {linkLabel}
            </Link>
          ) : (
            <a href={linkUrl} rel="noopener noreferrer" className={LINK_CLASS}>
              {linkLabel}
            </a>
          )}
        </>
      )}
    </>
  );
}
