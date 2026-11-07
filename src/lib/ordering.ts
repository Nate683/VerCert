import { getContent } from "@/lib/site-content";

// The switch for online ordering, and the message shown while it's off.
// Server-only. Everything about the restriction lives here.
//
// The setting is the site_content row "ordering", flipped from the /command
// Content tab ("Online Ordering"). It takes effect on the next request, with
// no rebuild or redeploy. With no row saved, ordering is OFF.
//
// While it's off:
// - /api/orders refuses every order before anything is saved;
// - subscription renewals place nothing (lib/subscriptions/run.ts);
// - checkout's payment section shows ORDERING_UNAVAILABLE and can't be submitted;
// - Add to Cart and Reorder are disabled (lib/products/availability.ts).
export const ORDERING_CONTENT_KEY = "ordering";

export type OrderingSettings = { enabled: boolean };

export const DEFAULT_ORDERING: OrderingSettings = { enabled: false };

export const ORDERING_UNAVAILABLE = {
  heading: "Ordering Temporarily Unavailable",
  body: "VeriCert Peptides is preparing for launch. Online ordering will become available once our preparations are complete.",
};

export type OrderingUnavailableMessage = typeof ORDERING_UNAVAILABLE;

export async function getOrderingSettings(): Promise<OrderingSettings> {
  const stored = await getContent<Partial<OrderingSettings> | null>(ORDERING_CONTENT_KEY, DEFAULT_ORDERING);
  return { enabled: stored?.enabled === true };
}

export async function isOrderingEnabled(): Promise<boolean> {
  return (await getOrderingSettings()).enabled;
}
