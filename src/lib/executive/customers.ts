import type { Customer, Order } from "@/lib/types";

export type CustomerSummary = {
  id: string;
  email: string;
  signupDate: string;
  marketingOptIn: boolean;
  emailVerified: boolean;
  orderCount: number;
  lifetimeValue: number;
  notes?: string;
  recentOrders: { reference: string; total: number; status: string; createdAt: string }[];
};

export function computeCustomerSummaries(users: Customer[], orders: Order[]): CustomerSummary[] {
  return users
    .map((user) => {
      const customerOrders = orders.filter((o) => o.customerId === user.id);
      const paidOrders = customerOrders.filter((o) => o.paidAt && o.status !== "cancelled" && !o.refundedAt);
      return {
        id: user.id,
        email: user.email,
        signupDate: user.createdAt,
        marketingOptIn: user.marketingOptIn,
        emailVerified: user.emailVerified,
        orderCount: customerOrders.length,
        lifetimeValue: paidOrders.reduce((sum, o) => sum + o.total, 0),
        notes: user.notes,
        recentOrders: customerOrders
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 5)
          .map((o) => ({ reference: o.reference, total: o.total, status: o.status, createdAt: o.createdAt })),
      };
    })
    .sort((a, b) => b.lifetimeValue - a.lifetimeValue);
}
