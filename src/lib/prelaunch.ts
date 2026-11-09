// While true, the older signed-out "Create a free account to unlock ordering privileges" banner above the ticker
// (components/SiteChrome.tsx) stays hidden. It returns if this is switched to false.
//
// The navy bar under the ticker — the "Ordering opens soon" notice signed-out visitors see, and the signed-in
// customers' announcement — is not controlled here: both are managed in /command → Announcement Banners
// (lib/announcements). The original "Ordering opens soon" wording is the seeded logged-out announcement
// (scripts/announcements.mjs).
export const PRELAUNCH_BANNER_ENABLED = true;
