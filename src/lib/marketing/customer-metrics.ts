import { query } from "@/lib/db";
import type { Attribution } from "@/lib/types";

// The marketing profile of every customer account (staff excluded), derived
// entirely from what the store already records: orders, signed-in browsing,
// cart events and email engagement. Computed on read, so it can never drift
// from the orders it summarises.
//
// Counting rules: an order counts once it's paid and not cancelled. Refunds
// are netted out of its value, and an order refunded in full doesn't count.

// Cart activity with no order placed afterwards, and at least this old,
// counts as an abandoned cart.
const ABANDONED_AFTER_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_VIEWS_MS = 30 * DAY_MS;

export type CustomerMetrics = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company?: string;
  signedUpAt: string;
  marketingOptIn: boolean;
  heardAbout?: string;
  affiliateId?: string;
  affiliateName?: string;
  attribution?: Attribution;
  orderCount: number;
  lifetimeValue: number;
  averageOrderValue: number;
  firstOrderAt?: string;
  lastOrderAt?: string;
  daysSinceLastOrder?: number;
  /** Average days between orders; needs at least two. */
  reorderIntervalDays?: number;
  /** Most-purchased category, by units. */
  topCategory?: string;
  productViews30d: number;
  lastProductViewAt?: string;
  abandonedCartAt?: string;
  emailOpens: number;
  emailClicks: number;
  lastEmailEngagementAt?: string;
};

type MetricsRow = {
  id: string;
  email: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  created_at: string;
  marketing_opt_in: boolean;
  heard_about: string | null;
  affiliate_id: string | null;
  affiliate_name: string | null;
  attribution: string | null;
  order_count: number;
  lifetime_value: number;
  first_order_at: string | null;
  last_order_at: string | null;
  top_category: string | null;
  product_views_30d: number;
  last_product_view_at: string | null;
  last_cart_at: string | null;
  last_placed_at: string | null;
  email_opens: number;
  email_clicks: number;
  last_email_engagement_at: string | null;
};

// Timestamps are ISO-8601 text throughout the schema, so MIN/MAX and range
// comparisons on them order correctly as strings.
const METRICS_SQL = `
  WITH counted AS (
    SELECT customer_id, created_at, items, total - COALESCE(refund_amount, 0) AS net
      FROM orders
     WHERE customer_id IS NOT NULL
       AND paid_at IS NOT NULL
       AND status <> 'cancelled'
       AND (refund_amount IS NULL OR refund_amount < total)
  ),
  order_stats AS (
    SELECT customer_id,
           COUNT(*)::int AS order_count,
           SUM(net) AS lifetime_value,
           MIN(created_at) AS first_order_at,
           MAX(created_at) AS last_order_at
      FROM counted
     GROUP BY customer_id
  ),
  category_totals AS (
    SELECT c.customer_id, p.category,
           SUM((item->>'quantity')::int) AS units,
           SUM((item->>'priceUsd')::float8 * (item->>'quantity')::int) AS spend
      FROM counted c
      CROSS JOIN LATERAL jsonb_array_elements(c.items::jsonb) AS item
      JOIN products p ON p.slug = item->>'slug'
     GROUP BY c.customer_id, p.category
  ),
  top_category AS (
    SELECT DISTINCT ON (customer_id) customer_id, category
      FROM category_totals
     ORDER BY customer_id, units DESC, spend DESC, category
  ),
  browsing AS (
    SELECT user_id,
           COUNT(*) FILTER (WHERE event_type = 'product_view' AND created_at >= $1)::int AS product_views_30d,
           MAX(created_at) FILTER (WHERE event_type = 'product_view') AS last_product_view_at,
           MAX(created_at) FILTER (WHERE event_type IN ('add_to_cart', 'checkout_started')) AS last_cart_at
      FROM analytics_events
     WHERE user_id IS NOT NULL
     GROUP BY user_id
  ),
  placed AS (
    SELECT customer_id, MAX(created_at) AS last_placed_at
      FROM orders
     WHERE customer_id IS NOT NULL
     GROUP BY customer_id
  ),
  engagement AS (
    SELECT user_id,
           COUNT(*) FILTER (WHERE event_type = 'email.opened')::int AS email_opens,
           COUNT(*) FILTER (WHERE event_type = 'email.clicked')::int AS email_clicks,
           MAX(created_at) FILTER (WHERE event_type IN ('email.opened', 'email.clicked')) AS last_email_engagement_at
      FROM email_events
     WHERE user_id IS NOT NULL
     GROUP BY user_id
  )
  SELECT u.id, u.email, u.name, u.first_name, u.last_name, u.company, u.created_at,
         u.marketing_opt_in, u.heard_about, u.affiliate_id, a.name AS affiliate_name, u.attribution,
         COALESCE(s.order_count, 0) AS order_count,
         COALESCE(s.lifetime_value, 0) AS lifetime_value,
         s.first_order_at, s.last_order_at,
         t.category AS top_category,
         COALESCE(b.product_views_30d, 0) AS product_views_30d,
         b.last_product_view_at, b.last_cart_at,
         pl.last_placed_at,
         COALESCE(e.email_opens, 0) AS email_opens,
         COALESCE(e.email_clicks, 0) AS email_clicks,
         e.last_email_engagement_at
    FROM users u
    LEFT JOIN order_stats s ON s.customer_id = u.id
    LEFT JOIN top_category t ON t.customer_id = u.id
    LEFT JOIN browsing b ON b.user_id = u.id
    LEFT JOIN placed pl ON pl.customer_id = u.id
    LEFT JOIN engagement e ON e.user_id = u.id
    LEFT JOIN affiliates a ON a.id = u.affiliate_id
   WHERE u.role IS NULL AND ($2::text IS NULL OR u.id = $2)
   ORDER BY lifetime_value DESC, u.created_at DESC
`;

const round2 = (n: number) => Math.round(n * 100) / 100;
const parseTime = (value: string | null) => (value ? Date.parse(value) : undefined);

// Accounts created before registration asked for first and last name only
// have the combined name.
function splitName(name: string | null): [string, string] {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

function parseAttribution(raw: string | null): Attribution | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Attribution;
  } catch {
    return undefined;
  }
}

function toMetrics(row: MetricsRow, now: number): CustomerMetrics {
  const [nameFirst, nameLast] = splitName(row.name);
  const lifetimeValue = round2(Number(row.lifetime_value));
  const firstAt = parseTime(row.first_order_at);
  const lastAt = parseTime(row.last_order_at);
  const cartAt = parseTime(row.last_cart_at);
  const placedAt = parseTime(row.last_placed_at);
  const abandoned =
    cartAt !== undefined &&
    now - cartAt >= ABANDONED_AFTER_MS &&
    (placedAt === undefined || placedAt < cartAt);

  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name ?? nameFirst,
    lastName: row.last_name ?? nameLast,
    company: row.company ?? undefined,
    signedUpAt: row.created_at,
    marketingOptIn: Boolean(row.marketing_opt_in),
    heardAbout: row.heard_about ?? undefined,
    affiliateId: row.affiliate_id ?? undefined,
    affiliateName: row.affiliate_name ?? undefined,
    attribution: parseAttribution(row.attribution),
    orderCount: row.order_count,
    lifetimeValue,
    averageOrderValue: row.order_count > 0 ? round2(lifetimeValue / row.order_count) : 0,
    firstOrderAt: row.first_order_at ?? undefined,
    lastOrderAt: row.last_order_at ?? undefined,
    daysSinceLastOrder: lastAt !== undefined ? Math.floor((now - lastAt) / DAY_MS) : undefined,
    reorderIntervalDays:
      row.order_count >= 2 && firstAt !== undefined && lastAt !== undefined
        ? Math.round((lastAt - firstAt) / DAY_MS / (row.order_count - 1))
        : undefined,
    topCategory: row.top_category ?? undefined,
    productViews30d: row.product_views_30d,
    lastProductViewAt: row.last_product_view_at ?? undefined,
    abandonedCartAt: abandoned ? (row.last_cart_at ?? undefined) : undefined,
    emailOpens: row.email_opens,
    emailClicks: row.email_clicks,
    lastEmailEngagementAt: row.last_email_engagement_at ?? undefined,
  };
}

export async function listCustomerMetrics(options: { userId?: string } = {}): Promise<CustomerMetrics[]> {
  const now = Date.now();
  const rows = await query<MetricsRow>(METRICS_SQL, [
    new Date(now - RECENT_VIEWS_MS).toISOString(),
    options.userId ?? null,
  ]);
  return rows.map((row) => toMetrics(row, now));
}
