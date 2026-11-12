"use client";

import { useLinkStatus } from "next/link";

// Marks a <Link>'s label while its navigation is in flight. Every storefront route is rendered on demand (the root
// layout reads the session), so Next.js cannot prefetch them: after a tap the current page stays on screen until
// the server answers, which on a phone network is often most of a second. This gives the tap an immediate,
// static acknowledgement (the link takes its own hover colour; see .link-pending in globals.css) instead of a
// page that looks frozen. No animation, no delay, nothing blocks navigation. Must be rendered inside the <Link>.
export function LinkPending({ children, tone }: { children: React.ReactNode; tone: "menu" | "exec" | "footer" }) {
  const { pending } = useLinkStatus();
  return (
    <span className={`link-pending link-pending-${tone}`} data-pending={pending ? "" : undefined}>
      {children}
    </span>
  );
}
