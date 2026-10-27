import Link from "next/link";
import { PRELAUNCH_BANNER, PRELAUNCH_BANNER_ENABLED } from "@/lib/prelaunch";

// Pre-launch notice between the ticker and the navigation. Switched off and
// worded in lib/prelaunch.ts. "join our list" jumps to the footer signup.
export function PrelaunchBanner() {
  if (!PRELAUNCH_BANNER_ENABLED) return null;
  const { label, registerLink, middle, listLink, end } = PRELAUNCH_BANNER;
  const linkClass = "text-gold underline underline-offset-2 hover:text-white";
  return (
    <div className="border-b border-gold/20 bg-navy px-4 py-2.5 text-center text-xs leading-relaxed text-white/85">
      <span className="font-medium uppercase tracking-[0.2em] text-gold">{label}</span>{" "}
      <span className="text-gold/60">—</span>{" "}
      <Link href={registerLink.href} className={linkClass}>
        {registerLink.text}
      </Link>{" "}
      {middle}{" "}
      <a href={listLink.href} className={linkClass}>
        {listLink.text}
      </a>{" "}
      {end}
    </div>
  );
}
