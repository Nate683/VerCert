import type { Customer, Order } from "@/lib/types";

export type CustomerSummary = {
  id: string;
  email: string;
  signupDate: string;
  marketingOptIn: boolean;
  emailVerified: boolean;
  orderCount: number;
  lifetimeValue: number;
};

export function computeCustomerSummaries(users: Customer[], orders: Order[]): CustomerSummary[] {
  return users
    .map((user) => {
      const customerOrders = orders.filter((o) => o.customerId === user.id);
      const paidOrders = customerOrders.filter((o) => o.status === "paid");
      return {
        id: user.id,
        email: user.email,
        signupDate: user.createdAt,
        marketingOptIn: user.marketingOptIn,
        emailVerified: user.emailVerified,
        orderCount: customerOrders.length,
        lifetimeValue: paidOrders.reduce((sum, o) => sum + o.total, 0),
      };
    })
    .sort((a, b) => b.lifetimeValue - a.lifetimeValue);
}
