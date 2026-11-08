// The temporary pre-launch banner under the ticker (components/PrelaunchBanner.tsx).
// When ordering opens, set PRELAUNCH_BANNER_ENABLED to false — that is the
// only change needed. While it's on, the signed-out "Create a free account to
// unlock ordering privileges" banner above the ticker is hidden; it returns on
// its own when this is switched off. All of the banner's wording lives here.
export const PRELAUNCH_BANNER_ENABLED = true;

// Signed-in wording: the same banner, with a members' announcement in place of
// the sign-up invitation. Placeholder copy, not an offer.
export const MEMBER_BANNER = {
  label: "VeriCert Member Exclusive",
  text: "Special research collection offers coming soon. Stay tuned.",
} as const;

// Signed-out wording.
export const PRELAUNCH_BANNER = {
  label: "Ordering opens soon",
  // Rendered in order: text, link, text, link, text.
  registerLink: { text: "Create a free account", href: "/register" },
  middle: "to browse the full catalog, or",
  // The footer's signup section (id="stay-informed" in components/Footer.tsx),
  // on the homepage; on the homepage itself it scrolls there in place.
  listLink: { text: "join our list", href: "/#stay-informed" },
  end: "to be notified when we open.",
} as const;
