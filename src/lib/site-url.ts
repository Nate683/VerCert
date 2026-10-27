// The site's own address, for every absolute link it produces: emails,
// sign-in and unsubscribe links, canonical and social-preview tags, the
// sitemap and robots.txt. It comes only from NEXT_PUBLIC_SITE_URL — never
// hardcode the domain anywhere else.
//
// Falls back to localhost if NEXT_PUBLIC_SITE_URL is unset OR blank — `??`
// alone doesn't catch an empty string, which breaks `new URL(...)` calls.
// Trailing slashes are dropped, so callers can always append "/path" (a
// value ending in "/" used to produce "https://host//path").
export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return url && url.length > 0 ? url : "http://localhost:3000";
}
