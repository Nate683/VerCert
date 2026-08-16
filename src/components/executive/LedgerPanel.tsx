"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CogsEntry,
  Expense,
  LedgerAsset,
  LedgerAssetType,
  LedgerLiability,
  LedgerLiabilityType,
  OwnerTransaction,
  OwnerTransactionType,
  RecurringFrequency,
} from "@/lib/types";
import type { LedgerReports } from "@/lib/ledger/reports";
import { LiveIndicator } from "./LiveIndicator";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";

type RangePreset = "mtd" | "qtd" | "ytd" | "all" | "custom";

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

function presetToRange(preset: RangePreset): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (preset === "mtd") return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), end };
  if (preset === "qtd") {
    const q = Math.floor(now.getMonth() / 3);
    return { start: new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10), end };
  }
  if (preset === "ytd") return { start: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10), end };
  return { start: "2020-01-01", end };
}

const EXPENSE_CATEGORIES = [
  "Rent",
  "Payroll",
  "Supplies",
  "Shipping",
  "Marketing",
  "Software",
  "Insurance",
  "Legal & Professional",
  "Utilities",
  "Other",
];

export function LedgerPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const cardClass = isCommand ? "command-panel p-6" : "office-card";

  const [preset, setPreset] = useState<RangePreset>("mtd");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [reports, setReports] = useState<LedgerReports | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cogsEntries, setCogsEntries] = useState<CogsEntry[]>([]);
  const [assets, setAssets] = useState<LedgerAsset[]>([]);
  const [liabilities, setLiabilities] = useState<LedgerLiability[]>([]);
  const [ownerTransactions, setOwnerTransactions] = useState<OwnerTransaction[]>([]);
  const [drillOpen, setDrillOpen] = useState<string | null>(null);

  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: EXPENSE_CATEGORIES[0],
    vendor: "",
    amount: "",
    paymentMethod: "",
    notes: "",
    receiptUrl: "",
    recurring: false,
    recurringFrequency: "monthly" as RecurringFrequency,
  });
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const [cogsForm, setCogsForm] = useState({
    productSlug: "",
    batchNumber: "",
    supplier: "",
    quantity: "1",
    purchasePriceUsd: "",
    dateReceived: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const [assetForm, setAssetForm] = useState({
    type: "cash" as LedgerAssetType,
    name: "",
    valueUsd: "",
    asOfDate: new Date().toISOString().slice(0, 10),
  });

  const [liabilityForm, setLiabilityForm] = useState({
    type: "loan" as LedgerLiabilityType,
    name: "",
    valueUsd: "",
    asOfDate: new Date().toISOString().slice(0, 10),
  });

  const [ownerForm, setOwnerForm] = useState({
    type: "contribution" as OwnerTransactionType,
    amountUsd: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const range = preset === "custom" ? { start: customStart, end: customEnd } : presetToRange(preset);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (range.start) params.set("start", range.start);
    if (range.end) params.set("end", range.end);
    const res = await fetch(`/api/executive/ledger/reports?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setReports(data.reports);
      setExpenses(data.expenses ?? []);
      setCogsEntries(data.cogsEntries ?? []);
      setAssets(data.assets ?? []);
      setLiabilities(data.liabilities ?? []);
      setOwnerTransactions(data.ownerTransactions ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- range is derived from preset/custom fields already in deps
  }, [preset, customStart, customEnd]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when the range changes
    load();
  }, [load]);

  useLiveRefresh(load, 20000, uploadingReceipt);

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/executive/ledger/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...expenseForm,
        amount: Number(expenseForm.amount) || 0,
        vendor: expenseForm.vendor || undefined,
        paymentMethod: expenseForm.paymentMethod || undefined,
        notes: expenseForm.notes || undefined,
        receiptUrl: expenseForm.receiptUrl || undefined,
        recurringFrequency: expenseForm.recurring ? expenseForm.recurringFrequency : undefined,
      }),
    });
    setExpenseForm({ ...expenseForm, vendor: "", amount: "", notes: "", receiptUrl: "" });
    await load();
  }

  async function handleUploadReceipt(file: File) {
    setUploadingReceipt(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/executive/ledger/receipts", { method: "POST", body });
      const data = await res.json();
      if (res.ok) setExpenseForm((f) => ({ ...f, receiptUrl: data.url }));
    } finally {
      setUploadingReceipt(false);
    }
  }

  async function handleDuplicateRecurring(expense: Expense) {
    const nextDate = new Date(expense.date);
    if (expense.recurringFrequency === "weekly") nextDate.setDate(nextDate.getDate() + 7);
    else if (expense.recurringFrequency === "yearly") nextDate.setFullYear(nextDate.getFullYear() + 1);
    else nextDate.setMonth(nextDate.getMonth() + 1);

    await fetch("/api/executive/ledger/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: nextDate.toISOString().slice(0, 10),
        category: expense.category,
        vendor: expense.vendor,
        amount: expense.amount,
        paymentMethod: expense.paymentMethod,
        notes: expense.notes,
        recurring: expense.recurring,
        recurringFrequency: expense.recurringFrequency,
      }),
    });
    await load();
  }

  async function handleDeleteExpense(id: string) {
    await fetch(`/api/executive/ledger/expenses/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleAddCogs(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/executive/ledger/cogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...cogsForm,
        productSlug: cogsForm.productSlug || undefined,
        batchNumber: cogsForm.batchNumber || undefined,
        supplier: cogsForm.supplier || undefined,
        quantity: Number(cogsForm.quantity) || 1,
        purchasePriceUsd: Number(cogsForm.purchasePriceUsd) || 0,
        notes: cogsForm.notes || undefined,
      }),
    });
    setCogsForm({ ...cogsForm, batchNumber: "", supplier: "", purchasePriceUsd: "", notes: "" });
    await load();
  }

  async function handleDeleteCogs(id: string) {
    await fetch(`/api/executive/ledger/cogs/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleAddAsset(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/executive/ledger/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...assetForm, valueUsd: Number(assetForm.valueUsd) || 0 }),
    });
    setAssetForm({ ...assetForm, name: "", valueUsd: "" });
    await load();
  }

  async function handleDeleteAsset(id: string) {
    await fetch(`/api/executive/ledger/assets/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleAddLiability(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/executive/ledger/liabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...liabilityForm, valueUsd: Number(liabilityForm.valueUsd) || 0 }),
    });
    setLiabilityForm({ ...liabilityForm, name: "", valueUsd: "" });
    await load();
  }

  async function handleDeleteLiability(id: string) {
    await fetch(`/api/executive/ledger/liabilities/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleAddOwnerTx(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/executive/ledger/owner-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...ownerForm,
        amountUsd: Number(ownerForm.amountUsd) || 0,
        notes: ownerForm.notes || undefined,
      }),
    });
    setOwnerForm({ ...ownerForm, amountUsd: "", notes: "" });
    await load();
  }

  async function handleDeleteOwnerTx(id: string) {
    await fetch(`/api/executive/ledger/owner-transactions/${id}`, { method: "DELETE" });
    await load();
  }

  if (!reports) {
    return <p className="text-sm text-white/30">Loading...</p>;
  }

  const expensesInRange = expenses.filter((e) => e.date >= range.start && e.date <= range.end);
  const cogsInRange = cogsEntries.filter((c) => c.dateReceived >= range.start && c.dateReceived <= range.end);

  return (
    <div className="space-y-6">
      <LiveIndicator variant={variant} />
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Date Range</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page route */}
          <a
            href={`/api/executive/ledger/reports?start=${range.start}&end=${range.end}&format=csv`}
            className="border border-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black"
          >
            Export Full Ledger CSV
          </a>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["mtd", "qtd", "ytd", "all", "custom"] as RangePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`border px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] ${
                preset === p ? "border-gold text-gold" : "border-white/20 text-white/50 hover:border-white/40"
              }`}
            >
              {p === "mtd" ? "Month to Date" : p === "qtd" ? "Quarter to Date" : p === "ytd" ? "Year to Date" : p === "all" ? "All Time" : "Custom"}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="mt-3 flex flex-wrap gap-3">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="input-field w-auto" />
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="input-field w-auto" />
          </div>
        )}
      </div>

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">P&amp;L — Selected Range</p>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-white/10 pb-2"><dt className="text-white/60">Revenue</dt><dd className="text-white">{fmt(reports.revenue)}</dd></div>
          <div className="flex justify-between border-b border-white/10 pb-2">
            <dt className="text-white/60">
              <button type="button" onClick={() => setDrillOpen(drillOpen === "cogs" ? null : "cogs")} className="hover:text-gold">
                Cost of Goods Sold
              </button>
            </dt>
            <dd className="text-white">{fmt(reports.cogs)}</dd>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-2"><dt className="text-white">Gross Profit</dt><dd className="text-gold">{fmt(reports.grossProfit)}</dd></div>
          <div className="flex justify-between border-b border-white/10 pb-2">
            <dt className="text-white/60">
              <button type="button" onClick={() => setDrillOpen(drillOpen === "opex" ? null : "opex")} className="hover:text-gold">
                Operating Expenses
              </button>
            </dt>
            <dd className="text-white">{fmt(reports.operatingExpenses)}</dd>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-2"><dt className="text-white/60">Commissions Owed</dt><dd className="text-white">{fmt(reports.commissionsOwed)}</dd></div>
          <div className="flex justify-between border-b border-white/10 pb-2"><dt className="text-white">Net Income</dt><dd className="text-gold">{fmt(reports.netIncome)}</dd></div>
          <div className="flex justify-between"><dt className="text-white/60">Blended Margin</dt><dd className="text-white">{reports.blendedMarginPercent !== null ? `${reports.blendedMarginPercent.toFixed(1)}%` : "Add product costs"}</dd></div>
        </dl>

        {drillOpen === "cogs" && (
          <div className="mt-4 border border-white/10 p-3">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">Underlying COGS Entries</p>
            {cogsInRange.length === 0 ? (
              <p className="mt-2 text-xs text-white/30">No entries in this range.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-white/70">
                {cogsInRange.map((c) => (
                  <li key={c.id} className="flex justify-between">
                    <span>{c.dateReceived} — {c.productSlug ?? "n/a"} × {c.quantity} ({c.supplier ?? "no supplier"})</span>
                    <span>{fmt(c.purchasePriceUsd * c.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {drillOpen === "opex" && (
          <div className="mt-4 border border-white/10 p-3">
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">Underlying Expenses</p>
            {expensesInRange.length === 0 ? (
              <p className="mt-2 text-xs text-white/30">No entries in this range.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-white/70">
                {expensesInRange.map((e) => (
                  <li key={e.id} className="flex justify-between">
                    <span>{e.date} — {e.category} ({e.vendor ?? "no vendor"})</span>
                    <span>{fmt(e.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Balance Sheet</p>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">Assets</p>
              {reports.balanceSheet.assetsByType.map((a) => (
                <div key={a.type} className="flex justify-between text-white/70">
                  <button type="button" onClick={() => setDrillOpen(drillOpen === `asset-${a.type}` ? null : `asset-${a.type}`)} className="capitalize hover:text-gold">
                    {a.type}
                  </button>
                  <span>{fmt(a.total)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-white/10 pt-1 font-semibold text-white">
                <span>Total Assets</span><span>{fmt(reports.balanceSheet.assetsTotal)}</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">Liabilities</p>
              {reports.balanceSheet.liabilitiesByType.map((l) => (
                <div key={l.type} className="flex justify-between text-white/70">
                  <button type="button" onClick={() => setDrillOpen(drillOpen === `liability-${l.type}` ? null : `liability-${l.type}`)} className="capitalize hover:text-gold">
                    {l.type.replace("_", " ")}
                  </button>
                  <span>{fmt(l.total)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-white/10 pt-1 font-semibold text-white">
                <span>Total Liabilities</span><span>{fmt(reports.balanceSheet.liabilitiesTotal)}</span>
              </div>
            </div>
            <div className="flex justify-between border-t border-gold/30 pt-2 font-serif text-lg">
              <span className="text-white">Equity</span><span className="text-gold">{fmt(reports.balanceSheet.equity)}</span>
            </div>
          </div>
          {assets.filter((a) => drillOpen === `asset-${a.type}`).length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs text-white/70">
              {assets.filter((a) => `asset-${a.type}` === drillOpen).map((a) => (
                <li key={a.id} className="flex justify-between"><span>{a.name} ({a.asOfDate})</span><span>{fmt(a.valueUsd)}</span></li>
              ))}
            </ul>
          )}
          {liabilities.filter((l) => `liability-${l.type}` === drillOpen).length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs text-white/70">
              {liabilities.filter((l) => `liability-${l.type}` === drillOpen).map((l) => (
                <li key={l.id} className="flex justify-between"><span>{l.name} ({l.asOfDate})</span><span>{fmt(l.valueUsd)}</span></li>
              ))}
            </ul>
          )}
        </div>

        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Expenses by Category</p>
          <ul className="mt-4 space-y-2 text-sm">
            {reports.expenseByCategory.map((c) => (
              <li key={c.category} className="flex justify-between"><span className="text-white/70">{c.category}</span><span className="text-white">{fmt(c.amount)}</span></li>
            ))}
            {reports.expenseByCategory.length === 0 && <p className="text-white/40">No expenses in this range.</p>}
          </ul>
        </div>
      </div>

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Cash Flow — Last 12 Months</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
                <th className="pb-2 pr-4 font-normal">Month</th>
                <th className="pb-2 pr-4 font-normal">Inflow</th>
                <th className="pb-2 pr-4 font-normal">Outflow</th>
                <th className="pb-2 font-normal">Net</th>
              </tr>
            </thead>
            <tbody>
              {reports.cashFlowByMonth.map((m) => (
                <tr key={m.month} className="border-b border-white/5 text-white/80">
                  <td className="py-2 pr-4">{m.month}</td>
                  <td className="py-2 pr-4">{fmt(m.inflow)}</td>
                  <td className="py-2 pr-4">{fmt(m.outflow)}</td>
                  <td className={m.net >= 0 ? "py-2 text-emerald-400" : "py-2 text-red-300"}>{fmt(m.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expenses */}
      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Expenses</p>
        <form onSubmit={handleAddExpense} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input type="date" required value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} className="input-field" />
          <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} className="input-field">
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} placeholder="Vendor" className="input-field" />
          <input required type="number" step="0.01" min="0" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} placeholder="Amount" className="input-field" />
          <input value={expenseForm.paymentMethod} onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })} placeholder="Payment method" className="input-field" />
          <input value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} placeholder="Notes" className="input-field" />
          <label className="input-field flex items-center gap-2">
            <input type="checkbox" checked={expenseForm.recurring} onChange={(e) => setExpenseForm({ ...expenseForm, recurring: e.target.checked })} className="h-4 w-4 accent-[#c9a227]" />
            <span className="text-sm text-white/70">Recurring</span>
          </label>
          {expenseForm.recurring && (
            <select value={expenseForm.recurringFrequency} onChange={(e) => setExpenseForm({ ...expenseForm, recurringFrequency: e.target.value as RecurringFrequency })} className="input-field">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          )}
          <label className="cursor-pointer border border-white/20 px-3 py-2 text-center text-xs uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold">
            {uploadingReceipt ? "Uploading..." : expenseForm.receiptUrl ? "Receipt Attached" : "Upload Receipt"}
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadReceipt(f); }} />
          </label>
          <button type="submit" className="border border-gold bg-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-black hover:bg-transparent hover:text-gold">
            Add Expense
          </button>
        </form>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
                <th className="pb-2 pr-4 font-normal">Date</th>
                <th className="pb-2 pr-4 font-normal">Category</th>
                <th className="pb-2 pr-4 font-normal">Vendor</th>
                <th className="pb-2 pr-4 font-normal">Amount</th>
                <th className="pb-2 pr-4 font-normal">Receipt</th>
                <th className="pb-2 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.slice(0, 25).map((e) => (
                <tr key={e.id} className="border-b border-white/5 text-white/80">
                  <td className="py-2 pr-4 text-xs">{e.date}</td>
                  <td className="py-2 pr-4">{e.category}</td>
                  <td className="py-2 pr-4 text-xs text-white/50">{e.vendor ?? "—"}</td>
                  <td className="py-2 pr-4">{fmt(e.amount)}</td>
                  <td className="py-2 pr-4 text-xs">
                    {e.receiptUrl ? <a href={e.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">View</a> : "—"}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      {e.recurring && (
                        <button type="button" onClick={() => handleDuplicateRecurring(e)} className="border border-white/20 px-2 py-1 text-[10px] uppercase text-white/70 hover:border-gold hover:text-gold">
                          Duplicate Next Period
                        </button>
                      )}
                      <button type="button" onClick={() => handleDeleteExpense(e.id)} className="border border-red-500/30 px-2 py-1 text-[10px] uppercase text-red-300/80 hover:border-red-400">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-white/30">No expenses recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* COGS */}
      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Cost of Goods — Purchases</p>
        <form onSubmit={handleAddCogs} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input value={cogsForm.productSlug} onChange={(e) => setCogsForm({ ...cogsForm, productSlug: e.target.value })} placeholder="Product slug" className="input-field" />
          <input value={cogsForm.batchNumber} onChange={(e) => setCogsForm({ ...cogsForm, batchNumber: e.target.value })} placeholder="Batch number" className="input-field" />
          <input value={cogsForm.supplier} onChange={(e) => setCogsForm({ ...cogsForm, supplier: e.target.value })} placeholder="Supplier" className="input-field" />
          <input required type="number" min="1" value={cogsForm.quantity} onChange={(e) => setCogsForm({ ...cogsForm, quantity: e.target.value })} placeholder="Quantity" className="input-field" />
          <input required type="number" step="0.01" min="0" value={cogsForm.purchasePriceUsd} onChange={(e) => setCogsForm({ ...cogsForm, purchasePriceUsd: e.target.value })} placeholder="Purchase price (per unit)" className="input-field" />
          <input type="date" required value={cogsForm.dateReceived} onChange={(e) => setCogsForm({ ...cogsForm, dateReceived: e.target.value })} className="input-field" />
          <input value={cogsForm.notes} onChange={(e) => setCogsForm({ ...cogsForm, notes: e.target.value })} placeholder="Notes" className="input-field sm:col-span-2" />
          <button type="submit" className="border border-gold bg-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-black hover:bg-transparent hover:text-gold">
            Add Purchase
          </button>
        </form>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
                <th className="pb-2 pr-4 font-normal">Received</th>
                <th className="pb-2 pr-4 font-normal">Product</th>
                <th className="pb-2 pr-4 font-normal">Supplier</th>
                <th className="pb-2 pr-4 font-normal">Qty</th>
                <th className="pb-2 pr-4 font-normal">Unit Price</th>
                <th className="pb-2 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cogsEntries.slice(0, 25).map((c) => (
                <tr key={c.id} className="border-b border-white/5 text-white/80">
                  <td className="py-2 pr-4 text-xs">{c.dateReceived}</td>
                  <td className="py-2 pr-4">{c.productSlug ?? "—"}</td>
                  <td className="py-2 pr-4 text-xs text-white/50">{c.supplier ?? "—"}</td>
                  <td className="py-2 pr-4">{c.quantity}</td>
                  <td className="py-2 pr-4">{fmt(c.purchasePriceUsd)}</td>
                  <td className="py-2">
                    <button type="button" onClick={() => handleDeleteCogs(c.id)} className="border border-red-500/30 px-2 py-1 text-[10px] uppercase text-red-300/80 hover:border-red-400">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {cogsEntries.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-white/30">No purchases recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assets & Liabilities */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Add Asset</p>
          <form onSubmit={handleAddAsset} className="mt-4 space-y-3">
            <select value={assetForm.type} onChange={(e) => setAssetForm({ ...assetForm, type: e.target.value as LedgerAssetType })} className="input-field">
              <option value="cash">Cash</option>
              <option value="inventory">Inventory</option>
              <option value="equipment">Equipment</option>
              <option value="receivable">Receivable</option>
              <option value="other">Other</option>
            </select>
            <input required value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} placeholder="Name" className="input-field" />
            <input required type="number" step="0.01" min="0" value={assetForm.valueUsd} onChange={(e) => setAssetForm({ ...assetForm, valueUsd: e.target.value })} placeholder="Value (USD)" className="input-field" />
            <input type="date" required value={assetForm.asOfDate} onChange={(e) => setAssetForm({ ...assetForm, asOfDate: e.target.value })} className="input-field" />
            <button type="submit" className="w-full border border-gold bg-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-black hover:bg-transparent hover:text-gold">
              Add Asset
            </button>
          </form>
          <ul className="mt-4 space-y-1 border-t border-white/10 pt-3 text-xs text-white/70">
            {assets.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <span>{a.name} ({a.type})</span>
                <span className="flex items-center gap-2">
                  {fmt(a.valueUsd)}
                  <button type="button" onClick={() => handleDeleteAsset(a.id)} className="text-red-300/80 hover:text-red-300">×</button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Add Liability</p>
          <form onSubmit={handleAddLiability} className="mt-4 space-y-3">
            <select value={liabilityForm.type} onChange={(e) => setLiabilityForm({ ...liabilityForm, type: e.target.value as LedgerLiabilityType })} className="input-field">
              <option value="loan">Loan</option>
              <option value="credit_card">Credit Card</option>
              <option value="payable">Payable</option>
              <option value="accrued_commission">Accrued Commission</option>
              <option value="other">Other</option>
            </select>
            <input required value={liabilityForm.name} onChange={(e) => setLiabilityForm({ ...liabilityForm, name: e.target.value })} placeholder="Name" className="input-field" />
            <input required type="number" step="0.01" min="0" value={liabilityForm.valueUsd} onChange={(e) => setLiabilityForm({ ...liabilityForm, valueUsd: e.target.value })} placeholder="Value (USD)" className="input-field" />
            <input type="date" required value={liabilityForm.asOfDate} onChange={(e) => setLiabilityForm({ ...liabilityForm, asOfDate: e.target.value })} className="input-field" />
            <button type="submit" className="w-full border border-gold bg-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-black hover:bg-transparent hover:text-gold">
              Add Liability
            </button>
          </form>
          <ul className="mt-4 space-y-1 border-t border-white/10 pt-3 text-xs text-white/70">
            {liabilities.map((l) => (
              <li key={l.id} className="flex items-center justify-between">
                <span>{l.name} ({l.type.replace("_", " ")})</span>
                <span className="flex items-center gap-2">
                  {fmt(l.valueUsd)}
                  <button type="button" onClick={() => handleDeleteLiability(l.id)} className="text-red-300/80 hover:text-red-300">×</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Owner transactions */}
      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Owner Contributions &amp; Draws</p>
        <form onSubmit={handleAddOwnerTx} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <select value={ownerForm.type} onChange={(e) => setOwnerForm({ ...ownerForm, type: e.target.value as OwnerTransactionType })} className="input-field">
            <option value="contribution">Contribution</option>
            <option value="draw">Draw</option>
          </select>
          <input required type="number" step="0.01" min="0" value={ownerForm.amountUsd} onChange={(e) => setOwnerForm({ ...ownerForm, amountUsd: e.target.value })} placeholder="Amount" className="input-field" />
          <input type="date" required value={ownerForm.date} onChange={(e) => setOwnerForm({ ...ownerForm, date: e.target.value })} className="input-field" />
          <input value={ownerForm.notes} onChange={(e) => setOwnerForm({ ...ownerForm, notes: e.target.value })} placeholder="Notes" className="input-field" />
          <button type="submit" className="border border-gold bg-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-black hover:bg-transparent hover:text-gold sm:col-span-4">
            Record Transaction
          </button>
        </form>
        <ul className="mt-4 space-y-1 border-t border-white/10 pt-3 text-xs text-white/70">
          {ownerTransactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between">
              <span className="capitalize">{t.date} — {t.type}</span>
              <span className="flex items-center gap-2">
                {fmt(t.amountUsd)}
                <button type="button" onClick={() => handleDeleteOwnerTx(t.id)} className="text-red-300/80 hover:text-red-300">×</button>
              </span>
            </li>
          ))}
          {ownerTransactions.length === 0 && <p className="text-white/30">No owner transactions yet.</p>}
        </ul>
      </div>
    </div>
  );
}
