// The temporary pre-launch banner under the ticker (components/PrelaunchBanner.tsx).
// When ordering opens, set PRELAUNCH_BANNER_ENABLED to false — that is the
// only change needed. All of its wording lives here.
export const PRELAUNCH_BANNER_ENABLED = true;

export const PRELAUNCH_BANNER = {
  label: "Ordering opens soon",
  message: "Browse the full catalog now.",
  linkText: "Join our list",
  afterLink: "to be notified when ordering opens.",
  // The footer's newsletter section (id="newsletter" in components/Footer.tsx).
  href: "#newsletter",
} as const;
