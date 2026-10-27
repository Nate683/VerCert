// Staff sign-in lasts this long without activity: a two-factor session is
// issued with this lifetime and only re-issued by /api/auth/keepalive, which
// the browser calls when someone actually uses the page — never by the
// dashboards' background polling. Kept apart from session.ts so the browser
// can import it without pulling in the signing code.
export const STAFF_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

// However active they are, a staff session ends this long after the password
// and authenticator were entered, and both are asked for again.
export const STAFF_SESSION_MAX_MS = 12 * 60 * 60 * 1000;

// How long before sign-out the warning appears.
export const IDLE_WARNING_MS = 2 * 60 * 1000;
