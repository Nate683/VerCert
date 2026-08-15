import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { Customer, SavedAddress } from "@/lib/types";

// Server-only Postgres-backed customer store. Exported function signatures
// are unchanged so every caller keeps working unchanged.

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  marketing_opt_in: boolean;
  email_verified: boolean;
  created_at: string;
  saved_address: string | null;
  verification_token: string | null;
  verification_token_expires_at: string | null;
  reset_token: string | null;
  reset_token_expires_at: string | null;
  pending_email: string | null;
  pending_email_token: string | null;
  pending_email_token_expires_at: string | null;
  role: string | null;
  notes: string | null;
};

function rowToUser(row: UserRow): Customer {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    marketingOptIn: Boolean(row.marketing_opt_in),
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at,
    savedAddress: row.saved_address ? (JSON.parse(row.saved_address) as SavedAddress) : undefined,
    verificationToken: row.verification_token ?? undefined,
    verificationTokenExpiresAt: row.verification_token_expires_at ?? undefined,
    resetToken: row.reset_token ?? undefined,
    resetTokenExpiresAt: row.reset_token_expires_at ?? undefined,
    pendingEmail: row.pending_email ?? undefined,
    pendingEmailToken: row.pending_email_token ?? undefined,
    pendingEmailTokenExpiresAt: row.pending_email_token_expires_at ?? undefined,
    role: (row.role as Customer["role"]) ?? undefined,
    notes: row.notes ?? undefined,
  };
}

const SELECT_ALL = "SELECT * FROM users";

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  marketingOptIn: boolean;
  verificationToken: string;
  verificationTokenExpiresAt: string;
};

export async function createUser(input: CreateUserInput): Promise<Customer> {
  const email = input.email.toLowerCase();
  const existing = await query<UserRow>(`${SELECT_ALL} WHERE email = $1`, [email]);
  if (existing.length > 0) {
    throw new Error("An account with this email already exists.");
  }

  const user: Customer = {
    id: randomUUID(),
    email,
    passwordHash: input.passwordHash,
    marketingOptIn: input.marketingOptIn,
    emailVerified: false,
    createdAt: new Date().toISOString(),
    verificationToken: input.verificationToken,
    verificationTokenExpiresAt: input.verificationTokenExpiresAt,
  };

  await query(
    `INSERT INTO users
      (id, email, password_hash, marketing_opt_in, email_verified, created_at, verification_token, verification_token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      user.id,
      user.email,
      user.passwordHash,
      user.marketingOptIn,
      false,
      user.createdAt,
      user.verificationToken ?? null,
      user.verificationTokenExpiresAt ?? null,
    ]
  );

  return user;
}

export async function listUsers(): Promise<Customer[]> {
  const rows = await query<UserRow>(`${SELECT_ALL} ORDER BY created_at DESC`);
  return rows.map(rowToUser);
}

export async function getUserByEmail(email: string): Promise<Customer | null> {
  const rows = await query<UserRow>(`${SELECT_ALL} WHERE email = $1`, [email.toLowerCase()]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserById(id: string): Promise<Customer | null> {
  const rows = await query<UserRow>(`${SELECT_ALL} WHERE id = $1`, [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByResetToken(token: string): Promise<Customer | null> {
  const rows = await query<UserRow>(`${SELECT_ALL} WHERE reset_token = $1`, [token]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByVerificationToken(token: string): Promise<Customer | null> {
  const rows = await query<UserRow>(`${SELECT_ALL} WHERE verification_token = $1`, [token]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByPendingEmailToken(token: string): Promise<Customer | null> {
  const rows = await query<UserRow>(`${SELECT_ALL} WHERE pending_email_token = $1`, [token]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

// Maps Customer (camelCase) fields to their Postgres column names.
const PATCHABLE_COLUMNS: Record<string, string> = {
  email: "email",
  passwordHash: "password_hash",
  marketingOptIn: "marketing_opt_in",
  emailVerified: "email_verified",
  savedAddress: "saved_address",
  verificationToken: "verification_token",
  verificationTokenExpiresAt: "verification_token_expires_at",
  resetToken: "reset_token",
  resetTokenExpiresAt: "reset_token_expires_at",
  pendingEmail: "pending_email",
  pendingEmailToken: "pending_email_token",
  pendingEmailTokenExpiresAt: "pending_email_token_expires_at",
  role: "role",
  notes: "notes",
};

const JSON_FIELDS = new Set(["savedAddress"]);

export async function updateUser(id: string, patch: Partial<Customer>): Promise<Customer | null> {
  const fields = Object.keys(PATCHABLE_COLUMNS).filter((f) => f in patch);

  if (fields.length > 0) {
    const values: unknown[] = [id];
    const assignments = fields.map((field, i) => {
      const value = (patch as Record<string, unknown>)[field];
      values.push(
        value === undefined ? null : JSON_FIELDS.has(field) ? JSON.stringify(value) : value
      );
      return `${PATCHABLE_COLUMNS[field]} = $${i + 2}`;
    });
    await query(`UPDATE users SET ${assignments.join(", ")} WHERE id = $1`, values);
  }

  const rows = await query<UserRow>(`${SELECT_ALL} WHERE id = $1`, [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}
