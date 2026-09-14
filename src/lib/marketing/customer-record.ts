import { query } from "@/lib/db";
import { getOrdersByCustomer } from "@/lib/orders/store";
import { listProducts } from "@/lib/products";
import { getAffiliateById } from "@/lib/affiliates";
import type { Attribution, Customer, CustomerInfo, SavedAddress } from "@/lib/types";
import { listCustomerMetrics, type CustomerMetrics } from "./customer-metrics";
import { heardAboutLabel } from "./heard-about";

// Everything VeriCert holds about one customer, as one document: the account,
// every order, signed-in browsing, email engagement, and the marketing profile
// derived from them. It backs both the customer's own "Download my data"
// export (Texas DPSA / CCPA access requests) and the customer view in
// /command, so the two can never disagree about what's on file.
//
// Staff notes are not part of it; /command shows those separately.
export type CustomerRecord = {
  generatedAt: string;
  account: {
    email: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    heardAboutUs?: string;
    createdAt: string;
    emailVerified: boolean;
    marketingEmailOptIn: boolean;
    smsOptIn: boolean;
    phone?: string;
    savedShippingAddress?: SavedAddress;
    ageAttestedAt?: string;
    referredByAffiliate?: string;
    firstVisitSource?: Attribution;
  };
  marketingProfile: CustomerMetrics | null;
  orders: {
    reference: string;
    placedAt: string;
    status: string;
    paymentMethod: string;
    items: {
      product: string;
      slug: string;
      size: string;
      quantity: number;
      unitPriceUsd: number;
      lotNumber?: string;
    }[];
    subtotalUsd: number;
    discountUsd: number;
    totalUsd: number;
    promoCode?: string;
    shippedTo: CustomerInfo;
    paidAt?: string;
    shippedAt?: string;
    deliveredAt?: string;
    carrier?: string;
    trackingNumber?: string;
    refundedAt?: string;
    refundAmountUsd?: number;
  }[];
  browsing: { event: string; product?: string; path?: string; at: string }[];
  emailEngagement: { event: string; subject?: string; link?: string; at: string }[];
};

type EventRow = { event_type: string; metadata: string | null; created_at: string };
type EmailRow = { event_type: string; subject: string | null; link: string | null; created_at: string };

function parseMetadata(raw: string | null): { slug?: string; path?: string } {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { slug?: string; path?: string };
  } catch {
    return {};
  }
}

export async function buildCustomerRecord(user: Customer): Promise<CustomerRecord> {
  const [orders, metrics, events, emails, products, affiliate] = await Promise.all([
    getOrdersByCustomer(user.id),
    listCustomerMetrics({ userId: user.id }),
    query<EventRow>(
      "SELECT event_type, metadata, created_at FROM analytics_events WHERE user_id = $1 ORDER BY created_at DESC",
      [user.id]
    ),
    query<EmailRow>(
      "SELECT event_type, subject, link, created_at FROM email_events WHERE user_id = $1 ORDER BY created_at DESC",
      [user.id]
    ),
    listProducts(),
    user.affiliateId ? getAffiliateById(user.affiliateId) : Promise.resolve(null),
  ]);
  const productName = (slug?: string) => products.find((p) => p.slug === slug)?.name;

  return {
    generatedAt: new Date().toISOString(),
    account: {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      company: user.company,
      heardAboutUs: heardAboutLabel(user.heardAbout),
      createdAt: user.createdAt,
      emailVerified: user.emailVerified,
      marketingEmailOptIn: user.marketingOptIn,
      smsOptIn: user.smsOptIn,
      phone: user.phone,
      savedShippingAddress: user.savedAddress,
      ageAttestedAt: user.ageAttestedAt,
      referredByAffiliate: affiliate?.name,
      firstVisitSource: user.attribution,
    },
    marketingProfile: metrics[0] ?? null,
    orders: orders.map((o) => ({
      reference: o.reference,
      placedAt: o.createdAt,
      status: o.status,
      paymentMethod: o.paymentMethod,
      items: o.items.map((item) => ({
        product: item.name,
        slug: item.slug,
        size: item.sizeLabel,
        quantity: item.quantity,
        unitPriceUsd: item.priceUsd,
        lotNumber: item.lotNumber,
      })),
      subtotalUsd: o.subtotal,
      discountUsd: o.discountAmount ?? 0,
      totalUsd: o.total,
      promoCode: o.promoCode,
      shippedTo: o.customer,
      paidAt: o.paidAt,
      shippedAt: o.shippedAt,
      deliveredAt: o.deliveredAt,
      carrier: o.carrier,
      trackingNumber: o.trackingNumber,
      refundedAt: o.refundedAt,
      refundAmountUsd: o.refundAmount,
    })),
    browsing: events.map((e) => {
      const meta = parseMetadata(e.metadata);
      return {
        event: e.event_type,
        product: meta.slug ? (productName(meta.slug) ?? meta.slug) : undefined,
        path: meta.path,
        at: e.created_at,
      };
    }),
    emailEngagement: emails.map((e) => ({
      event: e.event_type,
      subject: e.subject ?? undefined,
      link: e.link ?? undefined,
      at: e.created_at,
    })),
  };
}
