import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listOrders } from "@/lib/orders/store";
import { listProducts } from "@/lib/products";
import { listPromoCodes } from "@/lib/promotions";
import { listAffiliates, computeAffiliateSummaries, getAllPayouts } from "@/lib/affiliates";
import {
  listExpenses,
  listCogsEntries,
  listAssets,
  listLiabilities,
  listOwnerTransactions,
  computeLedgerReports,
} from "@/lib/ledger";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

function parseRange(searchParams: URLSearchParams) {
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const end = endParam ? new Date(endParam) : new Date();
  const start = startParam ? new Date(startParam) : new Date(end.getFullYear(), 0, 1);
  return { start, end: new Date(end.getTime() + 24 * 60 * 60 * 1000) }; // end is inclusive of that day
}

export const GET = withApiErrorHandling(async (request: Request) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const range = parseRange(searchParams);

  const [orders, products, promoCodes, affiliates, payouts, expenses, cogsEntries, assets, liabilities, ownerTransactions] =
    await Promise.all([
      listOrders(),
      listProducts({ includeInactive: true }),
      listPromoCodes(),
      listAffiliates(),
      getAllPayouts(),
      listExpenses(),
      listCogsEntries(),
      listAssets(),
      listLiabilities(),
      listOwnerTransactions(),
    ]);

  const affiliateSummaries = computeAffiliateSummaries(affiliates, orders, promoCodes, payouts);
  const reports = computeLedgerReports(
    range,
    orders,
    products,
    promoCodes,
    affiliateSummaries,
    expenses,
    cogsEntries,
    assets,
    liabilities,
    ownerTransactions
  );

  if (searchParams.get("format") === "csv") {
    const lines = [
      "VeriCert Financial Ledger Export",
      `Range,${range.start.toISOString().slice(0, 10)} to ${new Date(range.end.getTime() - 86400000).toISOString().slice(0, 10)}`,
      "",
      "P&L Summary",
      "Metric,Value",
      `Revenue,${reports.revenue.toFixed(2)}`,
      `Cost of Goods Sold,${reports.cogs.toFixed(2)}`,
      `Gross Profit,${reports.grossProfit.toFixed(2)}`,
      `Operating Expenses,${reports.operatingExpenses.toFixed(2)}`,
      `Commissions Owed,${reports.commissionsOwed.toFixed(2)}`,
      `Net Income,${reports.netIncome.toFixed(2)}`,
      `Blended Margin %,${reports.blendedMarginPercent?.toFixed(1) ?? "n/a"}`,
      "",
      "Balance Sheet",
      "Assets by Type,Total",
      ...reports.balanceSheet.assetsByType.map((a) => `${a.type},${a.total.toFixed(2)}`),
      `Total Assets,${reports.balanceSheet.assetsTotal.toFixed(2)}`,
      "",
      "Liabilities by Type,Total",
      ...reports.balanceSheet.liabilitiesByType.map((l) => `${l.type},${l.total.toFixed(2)}`),
      `Total Liabilities,${reports.balanceSheet.liabilitiesTotal.toFixed(2)}`,
      `Equity,${reports.balanceSheet.equity.toFixed(2)}`,
      "",
      "Expenses by Category",
      "Category,Amount",
      ...reports.expenseByCategory.map((e) => `${e.category},${e.amount.toFixed(2)}`),
      "",
      "Cash Flow by Month",
      "Month,Inflow,Outflow,Net",
      ...reports.cashFlowByMonth.map((m) => `${m.month},${m.inflow.toFixed(2)},${m.outflow.toFixed(2)},${m.net.toFixed(2)}`),
      "",
      "Margin by Product",
      "Product,Revenue,Cost,Margin,Margin %",
      ...reports.marginByProduct.map(
        (p) => `${p.name},${p.revenue.toFixed(2)},${p.cost.toFixed(2)},${p.margin.toFixed(2)},${p.marginPercent?.toFixed(1) ?? "n/a"}`
      ),
      "",
      "All Expenses",
      "Date,Category,Vendor,Amount,Payment Method,Notes",
      ...expenses.map((e) => `${e.date},${e.category},${e.vendor ?? ""},${e.amount.toFixed(2)},${e.paymentMethod ?? ""},${(e.notes ?? "").replace(/,/g, ";")}`),
      "",
      "All COGS Entries",
      "Date Received,Product,Batch,Supplier,Quantity,Purchase Price",
      ...cogsEntries.map(
        (c) => `${c.dateReceived},${c.productSlug ?? ""},${c.batchNumber ?? ""},${c.supplier ?? ""},${c.quantity},${c.purchasePriceUsd.toFixed(2)}`
      ),
      "",
      "All Assets",
      "As Of,Type,Name,Value",
      ...assets.map((a) => `${a.asOfDate},${a.type},${a.name},${a.valueUsd.toFixed(2)}`),
      "",
      "All Liabilities",
      "As Of,Type,Name,Value",
      ...liabilities.map((l) => `${l.asOfDate},${l.type},${l.name},${l.valueUsd.toFixed(2)}`),
      "",
      "Owner Transactions",
      "Date,Type,Amount",
      ...ownerTransactions.map((t) => `${t.date},${t.type},${t.amountUsd.toFixed(2)}`),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=vericert-ledger.csv",
      },
    });
  }

  return NextResponse.json({
    reports,
    expenses,
    cogsEntries,
    assets,
    liabilities,
    ownerTransactions,
  });
});
