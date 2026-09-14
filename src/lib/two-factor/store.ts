import { randomBytes, randomUUID } from "crypto";
import { query } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/users/password";
import type { Customer } from "@/lib/types";
import { buildOtpauthUrl, generateTotpSecret, matchTotpStep, toBase32 } from "./totp";
import { decryptTotpSecret, encryptTotpSecret } from "./secret-box";

// Two-factor state lives in its own columns on users (see scripts/migrate.mjs)
// and is deliberately left out of the Customer mapping, so encrypted secrets
// never travel around with the user object.

const ISSUER = "VeriCert";
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LENGTH = 10;
// No 0/O or 1/I, so a code read back off paper can't be mistyped. 32 symbols
// means each random byte maps onto one without modulo bias (~50 bits a code).
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type TwoFactorRow = {
  totp_secret: string | null;
  totp_pending_secret: string | null;
  totp_enabled_at: string | null;
};

// Executive accounts can't sign in on a password alone.
export function requiresTwoFactor(user: Pick<Customer, "role">): boolean {
  return user.role === "command" || user.role === "office";
}

async function getTwoFactorRow(userId: string): Promise<TwoFactorRow | null> {
  const rows = await query<TwoFactorRow>(
    "SELECT totp_secret, totp_pending_secret, totp_enabled_at FROM users WHERE id = $1",
    [userId]
  );
  return rows[0] ?? null;
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const row = await getTwoFactorRow(userId);
  return Boolean(row?.totp_enabled_at);
}

// Starts (or restarts) enrollment with a fresh secret. It waits in
// totp_pending_secret, doing nothing, until enableTwoFactor sees a valid code
// from it — so a QR code that never got scanned can't lock anyone out. Always
// a new secret rather than reusing a pending one: a secret someone glimpsed
// during an abandoned attempt must not become the live one. Returns null if
// the account is already enrolled.
export async function beginTwoFactorEnrollment(
  user: Pick<Customer, "id" | "email">
): Promise<{ otpauthUrl: string; manualEntryKey: string } | null> {
  const secret = generateTotpSecret();
  const updated = await query(
    "UPDATE users SET totp_pending_secret = $2 WHERE id = $1 AND totp_enabled_at IS NULL RETURNING id",
    [user.id, encryptTotpSecret(secret, user.id)]
  );
  if (updated.length === 0) return null;
  return {
    otpauthUrl: buildOtpauthUrl(secret, user.email, ISSUER),
    manualEntryKey: toBase32(secret),
  };
}

function generateBackupCode(): string {
  const chars = Array.from(randomBytes(BACKUP_CODE_LENGTH), (b) => BACKUP_CODE_ALPHABET[b & 31]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

// Accepts a code however it's typed back in: any case, with or without the
// hyphen or spaces.
function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Activates the pending secret if `code` came from it, and issues a fresh set
// of backup codes. The plaintext codes are returned here exactly once — only
// their salted scrypt hashes are stored.
export async function enableTwoFactor(
  userId: string,
  code: string
): Promise<{ backupCodes: string[] } | null> {
  const row = await getTwoFactorRow(userId);
  if (!row?.totp_pending_secret || row.totp_enabled_at) return null;

  const step = matchTotpStep(decryptTotpSecret(row.totp_pending_secret, userId), code);
  if (step === null) return null;

  const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  const hashes = await Promise.all(backupCodes.map((c) => hashPassword(normalizeBackupCode(c))));
  const ids = backupCodes.map(() => randomUUID());
  const now = new Date().toISOString();

  // One statement, so activation and the backup codes land together or not
  // at all. It only activates the exact pending secret the code was checked
  // against: if another tab restarted setup meanwhile, or a double-submit got
  // there first, nothing is written.
  const inserted = await query(
    `WITH activated AS (
       UPDATE users
          SET totp_secret = totp_pending_secret,
              totp_pending_secret = NULL,
              totp_enabled_at = $3,
              totp_last_used_step = $4
        WHERE id = $1 AND totp_enabled_at IS NULL AND totp_pending_secret = $2
        RETURNING id
     ), cleared AS (
       DELETE FROM two_factor_backup_codes WHERE user_id IN (SELECT id FROM activated)
     )
     INSERT INTO two_factor_backup_codes (id, user_id, code_hash, created_at)
     SELECT c.id, activated.id, c.code_hash, $3
       FROM activated, unnest($5::text[], $6::text[]) AS c(id, code_hash)
     RETURNING id`,
    [userId, row.totp_pending_secret, now, step, ids, hashes]
  );
  if (inserted.length === 0) return null;
  return { backupCodes };
}

export type TotpCheck = "ok" | "invalid" | "reused";

export async function verifyTotpCode(userId: string, code: string): Promise<TotpCheck> {
  const row = await getTwoFactorRow(userId);
  if (!row?.totp_secret || !row.totp_enabled_at) return "invalid";

  const step = matchTotpStep(decryptTotpSecret(row.totp_secret, userId), code);
  if (step === null) return "invalid";

  // Compare-and-set on the last accepted step: a code that's already been
  // used — including by a second request racing this one — is refused.
  const claimed = await query(
    `UPDATE users SET totp_last_used_step = $2
      WHERE id = $1 AND (totp_last_used_step IS NULL OR totp_last_used_step < $2)
      RETURNING id`,
    [userId, step]
  );
  return claimed.length > 0 ? "ok" : "reused";
}

// Spends one unused backup code. Returns how many are left, or null if the
// input matches none of them.
export async function consumeBackupCode(
  userId: string,
  input: string
): Promise<{ remaining: number } | null> {
  const candidate = normalizeBackupCode(input);
  if (candidate.length !== BACKUP_CODE_LENGTH) return null;

  const rows = await query<{ id: string; code_hash: string }>(
    `SELECT b.id, b.code_hash
       FROM two_factor_backup_codes b
       JOIN users u ON u.id = b.user_id
      WHERE b.user_id = $1 AND b.used_at IS NULL AND u.totp_enabled_at IS NOT NULL`,
    [userId]
  );
  for (const row of rows) {
    if (!(await verifyPassword(candidate, row.code_hash))) continue;
    // `used_at IS NULL` keeps it single-use even if two requests race.
    const spent = await query(
      "UPDATE two_factor_backup_codes SET used_at = $2 WHERE id = $1 AND used_at IS NULL RETURNING id",
      [row.id, new Date().toISOString()]
    );
    return spent.length > 0 ? { remaining: rows.length - 1 } : null;
  }
  return null;
}
