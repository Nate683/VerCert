import { NextResponse } from "next/server";

// Wraps a route handler so any unexpected error (a DB outage, a bad env var,
// a bug) becomes a proper JSON 500 instead of Next.js's bare, empty-body
// crash response — which the client can't JSON.parse, surfacing as a
// confusing "unexpected token" error far from the real cause. The real
// error is still logged server-side (visible in your host's function logs).
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error("Unhandled API error:", err);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }
  };
}
