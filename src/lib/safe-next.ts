// Post-sign-in redirect targets come from the URL, so anything off-site is
// dropped: bouncing a user who just typed their password onto an attacker's
// page is a ready-made phishing step (a fake "enter your 2FA code" screen).
// Browsers treat "/\" like "//", so both count as off-site.
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return null;
  }
  return next;
}
