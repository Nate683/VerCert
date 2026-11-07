// The temporary pre-launch banner under the ticker (components/PrelaunchBanner.tsx).
// When ordering opens, set PRELAUNCH_BANNER_ENABLED to false — that is the
// only change needed. While it's on, the signed-out "Create a free account to
// unlock ordering privileges" banner above the ticker is hidden; it returns on
// its own when this is switched off. All of the banner's wording lives here.
export const PRELAUNCH_BANNER_ENABLED = true;

// Signed-out wording. Signed-in visitors see signedInMessage instead.
export const PRELAUNCH_BANNER = {
  label: "Ordering opens soon",
  // Rendered in order: text, link, text, link, text.
  registerLink: { text: "Create a free account", href: "/register" },
  middle: "to browse the full catalog, or",
  // The footer's signup section (id="stay-informed" in components/Footer.tsx),
  // on the homepage; on the homepage itself it scrolls there in place.
  listLink: { text: "join our list", href: "/#stay-informed" },
  end: "to be notified when we open.",
  signedInMessage: "Don't just trust our brand. Verify our standards.",
} as const;
