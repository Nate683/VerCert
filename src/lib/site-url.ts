// Falls back to localhost if NEXT_PUBLIC_SITE_URL is unset OR blank — `??`
// alone doesn't catch an empty string, which breaks `new URL(...)` calls.
export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return url && url.length > 0 ? url : "http://localhost:3000";
}
