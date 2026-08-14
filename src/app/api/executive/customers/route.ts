import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listUsers } from "@/lib/users/store";
import { listOrders } from "@/lib/orders/store";
import { computeCustomerSummaries } from "@/lib/executive/customers";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

const CSV_COLUMNS = [
  "email",
  "signupDate",
  "orderCount",
  "lifetimeValue",
  "marketingOptIn",
  "emailVerified",
];

export async function GET(request: Request) {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const [users, orders] = await Promise.all([listUsers(), listOrders()]);
  const customers = computeCustomerSummaries(users, orders);

  const { searchParams } = new URL(request.url);
  if (searchParams.get("format") === "csv") {
    const csv = toCsv(
      customers.map((c) => ({
        ...c,
        lifetimeValue: c.lifetimeValue.toFixed(2),
        marketingOptIn: c.marketingOptIn ? "yes" : "no",
        emailVerified: c.emailVerified ? "yes" : "no",
      })),
      CSV_COLUMNS
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=vericert-customers.csv",
      },
    });
  }

  return NextResponse.json({ customers });
}
