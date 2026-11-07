"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PRELAUNCH_BANNER, PRELAUNCH_BANNER_ENABLED } from "@/lib/prelaunch";

const SIGNUP_ID = "stay-informed";

// Pre-launch notice between the ticker and the navigation. Switched off and
// worded in lib/prelaunch.ts. Signed-out visitors get the account and mailing
// list links; signed-in ones get the motto.
//
// Signed in or not: until the browser's session check (/api/auth/me) has
// answered, the server's reading of the session cookie (signedInAtRender, from
// the root layout) decides, so the first paint is already right. After that the
// live session decides, so signing out flips it without a reload.
export function PrelaunchBanner({ signedInAtRender }: { signedInAtRender: boolean }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  if (!PRELAUNCH_BANNER_ENABLED) return null;
  const signedIn = loading ? signedInAtRender : Boolean(user);
  const { label, registerLink, middle, listLink, end, signedInMessage } = PRELAUNCH_BANNER;
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
    <div className="border-b border-gold/20 bg-navy px-4 py-2.5 text-center text-xs leading-relaxed text-white/85">
      {signedIn ? (
        signedInMessage
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
