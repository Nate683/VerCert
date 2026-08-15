import { randomUUID } from "crypto";
import { query } from "@/lib/db";
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

// Server-only Postgres-backed financial ledger store — manual bookkeeping
// entries (expenses, cost of goods, assets, liabilities, owner transactions).
// Everything here is a plain ledger row; reports are derived from these plus
// order data in src/lib/ledger/reports.ts.

// --- Expenses ---

type ExpenseRow = {
  id: string;
  date: string;
  category: string;
  vendor: string | null;
  amount: number;
  payment_method: string | null;
  notes: string | null;
  receipt_url: string | null;
  recurring: boolean;
  recurring_frequency: RecurringFrequency | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function rowToExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    vendor: row.vendor ?? undefined,
    amount: row.amount,
    paymentMethod: row.payment_method ?? undefined,
    notes: row.notes ?? undefined,
    receiptUrl: row.receipt_url ?? undefined,
    recurring: row.recurring,
    recurringFrequency: row.recurring_frequency ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listExpenses(): Promise<Expense[]> {
  const rows = await query<ExpenseRow>("SELECT * FROM expenses ORDER BY date DESC");
  return rows.map(rowToExpense);
}

export type CreateExpenseInput = {
  date: string;
  category: string;
  vendor?: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  receiptUrl?: string;
  recurring?: boolean;
  recurringFrequency?: RecurringFrequency;
  createdBy?: string;
};

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO expenses
      (id, date, category, vendor, amount, payment_method, notes, receipt_url, recurring, recurring_frequency, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      input.date,
      input.category,
      input.vendor ?? null,
      input.amount,
      input.paymentMethod ?? null,
      input.notes ?? null,
      input.receiptUrl ?? null,
      input.recurring ?? false,
      input.recurringFrequency ?? null,
      input.createdBy ?? null,
      now,
      now,
    ]
  );
  return {
    id,
    date: input.date,
    category: input.category,
    vendor: input.vendor,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    notes: input.notes,
    receiptUrl: input.receiptUrl,
    recurring: input.recurring ?? false,
    recurringFrequency: input.recurringFrequency,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

const EXPENSE_PATCHABLE: Record<string, string> = {
  date: "date",
  category: "category",
  vendor: "vendor",
  amount: "amount",
  paymentMethod: "payment_method",
  notes: "notes",
  receiptUrl: "receipt_url",
  recurring: "recurring",
  recurringFrequency: "recurring_frequency",
};

export async function updateExpense(id: string, patch: Partial<Expense>): Promise<Expense | null> {
  const fields = Object.keys(EXPENSE_PATCHABLE).filter((f) => f in patch);
  if (fields.length > 0) {
    const values: unknown[] = [id];
    const assignments = fields.map((field, i) => {
      const value = (patch as Record<string, unknown>)[field];
      values.push(value === undefined ? null : value);
      return `${EXPENSE_PATCHABLE[field]} = $${i + 2}`;
    });
    values.push(new Date().toISOString());
    await query(
      `UPDATE expenses SET ${assignments.join(", ")}, updated_at = $${values.length} WHERE id = $1`,
      values
    );
  }
  const rows = await query<ExpenseRow>("SELECT * FROM expenses WHERE id = $1", [id]);
  return rows[0] ? rowToExpense(rows[0]) : null;
}

export async function deleteExpense(id: string): Promise<void> {
  await query("DELETE FROM expenses WHERE id = $1", [id]);
}

// --- Cost of goods entries ---

type CogsRow = {
  id: string;
  product_slug: string | null;
  batch_number: string | null;
  purchase_price_usd: number;
  supplier: string | null;
  quantity: number;
  date_received: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function rowToCogs(row: CogsRow): CogsEntry {
  return {
    id: row.id,
    productSlug: row.product_slug ?? undefined,
    batchNumber: row.batch_number ?? undefined,
    purchasePriceUsd: row.purchase_price_usd,
    supplier: row.supplier ?? undefined,
    quantity: row.quantity,
    dateReceived: row.date_received,
    notes: row.notes ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCogsEntries(): Promise<CogsEntry[]> {
  const rows = await query<CogsRow>("SELECT * FROM cogs_entries ORDER BY date_received DESC");
  return rows.map(rowToCogs);
}

export type CreateCogsInput = {
  productSlug?: string;
  batchNumber?: string;
  purchasePriceUsd: number;
  supplier?: string;
  quantity?: number;
  dateReceived: string;
  notes?: string;
  createdBy?: string;
};

export async function createCogsEntry(input: CreateCogsInput): Promise<CogsEntry> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO cogs_entries
      (id, product_slug, batch_number, purchase_price_usd, supplier, quantity, date_received, notes, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      input.productSlug ?? null,
      input.batchNumber ?? null,
      input.purchasePriceUsd,
      input.supplier ?? null,
      input.quantity ?? 1,
      input.dateReceived,
      input.notes ?? null,
      input.createdBy ?? null,
      now,
      now,
    ]
  );
  return {
    id,
    productSlug: input.productSlug,
    batchNumber: input.batchNumber,
    purchasePriceUsd: input.purchasePriceUsd,
    supplier: input.supplier,
    quantity: input.quantity ?? 1,
    dateReceived: input.dateReceived,
    notes: input.notes,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteCogsEntry(id: string): Promise<void> {
  await query("DELETE FROM cogs_entries WHERE id = $1", [id]);
}

// --- Assets ---

type AssetRow = {
  id: string;
  type: LedgerAssetType;
  name: string;
  value_usd: number;
  as_of_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToAsset(row: AssetRow): LedgerAsset {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    valueUsd: row.value_usd,
    asOfDate: row.as_of_date,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAssets(): Promise<LedgerAsset[]> {
  const rows = await query<AssetRow>("SELECT * FROM ledger_assets ORDER BY as_of_date DESC");
  return rows.map(rowToAsset);
}

export async function createAsset(input: {
  type: LedgerAssetType;
  name: string;
  valueUsd: number;
  asOfDate: string;
  notes?: string;
}): Promise<LedgerAsset> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO ledger_assets (id, type, name, value_usd, as_of_date, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, input.type, input.name, input.valueUsd, input.asOfDate, input.notes ?? null, now, now]
  );
  return { id, ...input, createdAt: now, updatedAt: now };
}

export async function deleteAsset(id: string): Promise<void> {
  await query("DELETE FROM ledger_assets WHERE id = $1", [id]);
}

// --- Liabilities ---

type LiabilityRow = {
  id: string;
  type: LedgerLiabilityType;
  name: string;
  value_usd: number;
  as_of_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToLiability(row: LiabilityRow): LedgerLiability {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    valueUsd: row.value_usd,
    asOfDate: row.as_of_date,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listLiabilities(): Promise<LedgerLiability[]> {
  const rows = await query<LiabilityRow>("SELECT * FROM ledger_liabilities ORDER BY as_of_date DESC");
  return rows.map(rowToLiability);
}

export async function createLiability(input: {
  type: LedgerLiabilityType;
  name: string;
  valueUsd: number;
  asOfDate: string;
  notes?: string;
}): Promise<LedgerLiability> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO ledger_liabilities (id, type, name, value_usd, as_of_date, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, input.type, input.name, input.valueUsd, input.asOfDate, input.notes ?? null, now, now]
  );
  return { id, ...input, createdAt: now, updatedAt: now };
}

export async function deleteLiability(id: string): Promise<void> {
  await query("DELETE FROM ledger_liabilities WHERE id = $1", [id]);
}

// --- Owner contributions / draws ---

type OwnerTxRow = {
  id: string;
  type: OwnerTransactionType;
  amount_usd: number;
  date: string;
  notes: string | null;
  created_at: string;
};

function rowToOwnerTx(row: OwnerTxRow): OwnerTransaction {
  return {
    id: row.id,
    type: row.type,
    amountUsd: row.amount_usd,
    date: row.date,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listOwnerTransactions(): Promise<OwnerTransaction[]> {
  const rows = await query<OwnerTxRow>("SELECT * FROM owner_transactions ORDER BY date DESC");
  return rows.map(rowToOwnerTx);
}

export async function createOwnerTransaction(input: {
  type: OwnerTransactionType;
  amountUsd: number;
  date: string;
  notes?: string;
}): Promise<OwnerTransaction> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO owner_transactions (id, type, amount_usd, date, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.type, input.amountUsd, input.date, input.notes ?? null, now]
  );
  return { id, ...input, createdAt: now };
}

export async function deleteOwnerTransaction(id: string): Promise<void> {
  await query("DELETE FROM owner_transactions WHERE id = $1", [id]);
}
