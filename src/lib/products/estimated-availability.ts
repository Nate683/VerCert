import type { Product } from "@/lib/types";
import { availabilityStatus, type AvailabilityStatus } from "./availability";

// The optional estimated availability date (products.estimated_available_on,
// a DATE: a calendar day with no time and no zone). Client-safe.
//
// Informational only. Nothing here, or anywhere, changes a product's status,
// visibility, stock or purchasability because of this date; isPurchasable
// never reads it, and passing it changes nothing but whether it's shown.
//
// Dates are handled as "YYYY-MM-DD" strings end to end and compared as
// strings (that format sorts chronologically), never as instants, so no
// timezone can move a date by a day.

// The business's calendar. "Today" is today here, whatever zone the server
// clock runs in (Vercel runs UTC).
export const BUSINESS_TIME_ZONE = "America/Chicago";

// Statuses that show the date. In Stock and Out of Stock never do; their
// stored date is kept (not cleared) for whoever edits the product next.
const SHOWN_FOR: readonly AvailabilityStatus[] = ["coming_soon", "pending_testing"];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// The database driver hands a DATE back as a JavaScript Date at midnight in
// the server's own zone, so its toISOString() can land on the previous day
// (anywhere east of UTC). Its calendar fields are always right, so the date
// is rebuilt from those. A string is taken as is when it is a plain date.
export function toDateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === "string") {
    const match = DATE_ONLY.exec(value.slice(0, 10));
    return match ? match[0] : null;
  }
  return null;
}

// Today's date in US Central as "YYYY-MM-DD", for the instant `now`. The
// en-CA locale formats dates as YYYY-MM-DD; timeZone makes it Central's
// calendar day (CST or CDT as the date requires), not the server's.
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// "November 25, 2026". The date is placed at UTC midnight and formatted in
// UTC, so the calendar day printed is exactly the one stored.
export function formatDateOnly(date: string): string {
  const [, y, m, d] = DATE_ONLY.exec(date)!;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(
    new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  );
}

// What the product page shows, or null for nothing at all. Shown only for
// Coming Soon and In Independent Testing, and only while the date is today or
// later in US Central: a date shows through its whole day and is gone from
// the first moment of the next day there.
export function estimatedAvailabilityLabel(
  product: Pick<Product, "availabilityStatus" | "estimatedAvailableOn">,
  now: Date = new Date()
): string | null {
  const date = toDateOnly(product.estimatedAvailableOn);
  if (!date || !SHOWN_FOR.includes(availabilityStatus(product))) return null;
  if (date < businessToday(now)) return null;
  return formatDateOnly(date);
}
