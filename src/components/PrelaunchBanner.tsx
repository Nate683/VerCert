"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { MEMBER_BANNER, PRELAUNCH_BANNER, PRELAUNCH_BANNER_ENABLED } from "@/lib/prelaunch";

const SIGNUP_ID = "stay-informed";
const BAR_CLASS = "border-b border-gold/20 bg-navy px-4 py-2.5 text-center text-xs leading-relaxed text-white/85";

// The navy announcement bar between the ticker and the navigation. Signed-out
// visitors get the pre-launch notice with the account and mailing-list links
// (switched off and worded in lib/prelaunch.ts); signed-in customers get the
// members' announcement in the same bar.
//
// Signed in or not: until the browser's session check (/api/auth/me) has
// answered, the server's reading of the session cookie (signedInAtRender, from
// the root layout) decides, so the first paint is already right and the wrong
// message never flashes. After that the live session decides, so signing in
// or out swaps the bar without a reload.
export function PrelaunchBanner({ signedInAtRender }: { signedInAtRender: boolean }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const signedIn = loading ? signedInAtRender : Boolean(user);
  if (signedIn) {
    return (
      <div className={BAR_CLASS}>
        <span className="font-medium uppercase tracking-[0.2em] text-gold">{MEMBER_BANNER.label}</span>{" "}
        <span className="text-gold/60">—</span> {MEMBER_BANNER.text}
      </div>
    );
  }
  if (!PRELAUNCH_BANNER_ENABLED) return null;
  const { label, registerLink, middle, listLink, end } = PRELAUNCH_BANNER;
  const linkClass = "text-gold underline underline-offset-2 hover:text-white";

  // On the homepage the signup section is on this page: scroll to it (smoothly
  // unless reduced motion is asked for; scroll-mt on the section clears the
  // sticky header) and move focus to it. Anywhere else the link goes to the
  // homepage's section.
  function handleListClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/") return;
    const target = document.getElementById(SIGNUP_ID);
    if (!target) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(window.history.state, "", `#${SIGNUP_ID}`);
    target.focus({ preventScroll: true });
  }

  return (
    <div className={BAR_CLASS}>
      <span className="font-medium uppercase tracking-[0.2em] text-gold">{label}</span>{" "}
      <span className="text-gold/60">—</span>{" "}
      <Link href={registerLink.href} className={linkClass}>
        {registerLink.text}
      </Link>{" "}
      {middle}{" "}
      <Link href={listLink.href} onClick={handleListClick} className={linkClass}>
        {listLink.text}
      </Link>{" "}
      {end}
    </div>
  );
}
