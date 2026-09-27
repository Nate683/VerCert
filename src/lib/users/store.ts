import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { Attribution, Customer, MarketingConsentSource, SavedAddress } from "@/lib/types";

// Server-only Postgres-backed customer store. Exported function signatures
// are unchanged so every caller keeps working unchanged.

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  heard_about: string | null;
  password_hash: string;
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  marketing_consent_source: string | null;
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
  staff_seed_hash: string | null;
  notes: string | null;
  phone: string | null;
  sms_opt_in: boolean;
  age_attested_at: string | null;
  affiliate_id: string | null;
  attribution: string | null;
};

function parseAttribution(raw: string | null): Attribution | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Attribution;
  } catch {
    return undefined;
  }
}

function rowToUser(row: UserRow): Customer {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    company: row.company ?? undefined,
    heardAbout: row.heard_about ?? undefined,
    passwordHash: row.password_hash,
    marketingConsent: Boolean(row.marketing_consent),
    marketingConsentAt: row.marketing_consent_at ?? undefined,
    marketingConsentSource: (row.marketing_consent_source as MarketingConsentSource) ?? undefined,
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
    staffSeedHash: row.staff_seed_hash ?? undefined,
    notes: row.notes ?? undefined,
    phone: row.phone ?? undefined,
    smsOptIn: Boolean(row.sms_opt_in),
    ageAttestedAt: row.age_attested_at ?? undefined,
    affiliateId: row.affiliate_id ?? undefined,
    attribution: parseAttribution(row.attribution),
  };
}

const SELECT_ALL = "SELECT * FROM users";

export type CreateUserInput = {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  heardAbout?: string;
  passwordHash: string;
  marketingConsent: boolean;
  /** Where the visitor made the choice. Leave unset for accounts that were never asked (staff, affiliates). */
  marketingConsentSource?: MarketingConsentSource;
  smsOptIn?: boolean;
  phone?: string;
  verificationToken: string;
  verificationTokenExpiresAt: string;
  ageAttestedAt?: string;
  affiliateId?: string;
  attribution?: Attribution;
};

export async function createUser(input: CreateUserInput): Promise<Customer> {
  const email = input.email.toLowerCase();
  const existing = await query<UserRow>(`${SELECT_ALL} WHERE email = $1`, [email]);
  if (existing.length > 0) {
    throw new Error("An account with this email already exists.");
  }

  const createdAt = new Date().toISOString();
  const user: Customer = {
    id: randomUUID(),
    email,
    name: input.name,
    firstName: input.firstName,
    lastName: input.lastName,
    company: input.company,
    heardAbout: input.heardAbout,
    passwordHash: input.passwordHash,
    marketingConsent: input.marketingConsent,
    // A decline is recorded too: it's the evidence they were asked.
    marketingConsentAt: input.marketingConsentSource ? createdAt : undefined,
    marketingConsentSource: input.marketingConsentSource,
    smsOptIn: input.smsOptIn ?? false,
    phone: input.phone,
    emailVerified: false,
    createdAt,
    verificationToken: input.verificationToken,
    verificationTokenExpiresAt: input.verificationTokenExpiresAt,
    ageAttestedAt: input.ageAttestedAt,
    affiliateId: input.affiliateId,
    attribution: input.attribution,
  };

  await query(
    `INSERT INTO users
      (id, email, name, first_name, last_name, company, heard_about, password_hash, marketing_consent,
       marketing_consent_at, marketing_consent_source,
       sms_opt_in, phone, email_verified, created_at, verification_token, verification_token_expires_at,
       age_attested_at, affiliate_id, attribution)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      user.id,
      user.email,
      user.name ?? null,
      user.firstName ?? null,
      user.lastName ?? null,
      user.company ?? null,
      user.heardAbout ?? null,
      user.passwordHash,
      user.marketingConsent,
      user.marketingConsentAt ?? null,
      user.marketingConsentSource ?? null,
      user.smsOptIn,
      user.phone ?? null,
      false,
      user.createdAt,
      user.verificationToken ?? null,
      user.verificationTokenExpiresAt ?? null,
      user.ageAttestedAt ?? null,
      user.affiliateId ?? null,
      user.attribution ? JSON.stringify(user.attribution) : null,
    ]
  );

  return user;
}

export async function listUsers(): Promise<Customer[]> {
  const rows = await query<UserRow>(`${SELECT_ALL} ORDER BY created_at DESC`);
  return rows.map(rowToUser);
}

// Executive accounts (role is set on first executive login) — used to
// build the /hq member roster alongside active affiliates.
export async function listStaffUsers(): Promise<Customer[]> {
  const rows = await query<UserRow>(`${SELECT_ALL} WHERE role IS NOT NULL`);
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

// Marketing consent never goes through updateUser: every change has to carry
// its timestamp and source, so it has this one door. Setting the value it
// already has changes nothing, keeping the timestamp at the actual decision.
export async function setMarketingConsent(
  id: string,
  consent: boolean,
  source: MarketingConsentSource
): Promise<Customer | null> {
  await query(
    `UPDATE users
        SET marketing_consent = $2, marketing_consent_at = $3, marketing_consent_source = $4
      WHERE id = $1 AND marketing_consent IS DISTINCT FROM $2`,
    [id, consent, new Date().toISOString(), source]
  );
  return getUserById(id);
}

// Maps Customer (camelCase) fields to their Postgres column names.
const PATCHABLE_COLUMNS: Record<string, string> = {
  email: "email",
  name: "name",
  firstName: "first_name",
  lastName: "last_name",
  company: "company",
  heardAbout: "heard_about",
  passwordHash: "password_hash",
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
  staffSeedHash: "staff_seed_hash",
  notes: "notes",
  phone: "phone",
  smsOptIn: "sms_opt_in",
  ageAttestedAt: "age_attested_at",
  affiliateId: "affiliate_id",
  attribution: "attribution",
};

const JSON_FIELDS = new Set(["savedAddress", "attribution"]);

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
