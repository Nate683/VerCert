"use client";

import { useAuth } from "@/lib/auth-context";
import type { BannerAnnouncement } from "@/lib/announcements/rules";
import { AnnouncementContent } from "./AnnouncementContent";

const BAR_CLASS = "border-b border-gold/20 bg-navy px-4 py-2.5 text-center text-xs leading-relaxed text-white/85";

// The navy announcement bar between the ticker and the navigation, managed in /command → Announcement Banners.
// Signed-in customers get the live logged-in announcement (memberAnnouncement); signed-out visitors get the live
// logged-out one (publicAnnouncement). Both are loaded by the root layout; with none live for the audience, no bar.
//
// Signed in or not: until the browser's session check (/api/auth/me) has answered, the server's reading of the
// session cookie (signedInAtRender, from the root layout) decides, so the first paint is already right and the
// wrong message never flashes. After that the live session decides, so signing in or out swaps the bar without a
// reload.
export function PrelaunchBanner({
  signedInAtRender,
  memberAnnouncement,
  publicAnnouncement,
}: {
  signedInAtRender: boolean;
  memberAnnouncement: BannerAnnouncement | null;
  publicAnnouncement: BannerAnnouncement | null;
}) {
  const { user, loading } = useAuth();
  const signedIn = loading ? signedInAtRender : Boolean(user);
  const announcement = signedIn ? memberAnnouncement : publicAnnouncement;
  if (!announcement) return null;
  return (
    <div className={BAR_CLASS}>
      <AnnouncementContent announcement={announcement} />
    </div>
  );
}
