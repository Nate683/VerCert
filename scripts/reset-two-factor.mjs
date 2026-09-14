// Turns off two-factor for one account so its owner sets it up again at their
// next sign-in — the way back in for an executive who has lost both their
// authenticator and their backup codes. It needs DATABASE_URL, i.e. operator
// access; there's deliberately no web route that can do this.
//
// Whoever knows the account's password can enroll the next authenticator, so
// if the password may be compromised too, reset that first.
//
// Usage: npm run db:reset-2fa -- someone@example.com
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { neon } from "@neondatabase/serverless";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run db:reset-2fa -- <email>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env.local.");
  process.exit(1);
}

const sql = neon(connectionString);

async function main() {
  // One statement, so backup codes can't outlive the secret they belong to.
  const rows = await sql`
    WITH cleared AS (
      UPDATE users
         SET totp_secret = NULL,
             totp_pending_secret = NULL,
             totp_enabled_at = NULL,
             totp_last_used_step = NULL
       WHERE email = ${email}
       RETURNING id
    ), deleted AS (
      DELETE FROM two_factor_backup_codes WHERE user_id IN (SELECT id FROM cleared)
    )
    SELECT id FROM cleared
  `;
  if (rows.length === 0) {
    console.error(`[db:reset-2fa] No account found for ${email}.`);
    process.exit(1);
  }
  console.log(`[db:reset-2fa] Two-factor cleared for ${email} — they'll set it up again at their next sign-in.`);
}

main().catch((err) => {
  console.error("[db:reset-2fa] Failed:", err);
  process.exit(1);
});
