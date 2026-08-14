import { query } from "@/lib/db";

// Atomic fixed-window rate limiter backed by Postgres, so limits persist
// across dev-server hot reloads, process restarts, and (mostly) function
// cold starts. Good enough for a single logical database; if you scale to
// multiple regions/instances it still coordinates correctly since Postgres
// is the shared source of truth — every call site only uses
// `checkRateLimit`, so swapping the backing store later is contained here.
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

type RateLimitRow = { count: number; window_start: number };

export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now();

  // Single atomic upsert: if the existing window has expired, reset it;
  // otherwise increment the counter. RETURNING gives us the post-update row
  // in the same round trip, avoiding any read-then-write race.
  const rows = await query<RateLimitRow>(
    `INSERT INTO rate_limits (bucket_key, count, window_start)
     VALUES ($1, 1, $2)
     ON CONFLICT (bucket_key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start <= $2 - $3 THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= $2 - $3 THEN $2 ELSE rate_limits.window_start END
     RETURNING count, window_start`,
    [key, now, opts.windowMs]
  );

  const row = rows[0];
  if (row.count > opts.limit) {
    const retryAfterSeconds = Math.ceil((opts.windowMs - (now - row.window_start)) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

// Best-effort client IP extraction — trusts X-Forwarded-For, which is only
// safe to trust when the app sits behind a proxy/load balancer that sets it
// (Vercel, nginx, etc). Falls back to a shared bucket if absent.
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
