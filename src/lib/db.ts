import { neon } from "@neondatabase/serverless";

// Server-only Postgres access — hosted on Neon (neon.tech). Uses Neon's
// HTTP-based query function, so there's no connection/pool lifecycle to
// manage and it behaves identically in Node.js, Vercel serverless, and edge
// runtimes. Schema creation/seeding lives in scripts/migrate.mjs (run
// manually via `npm run db:migrate`) rather than here, since that's a DDL
// step, not something to redo on every import.
// See LAUNCH_CHECKLIST.md for how to provision a database.
type SqlFn = ReturnType<typeof neon<false, false>>;

const globalForDb = globalThis as unknown as { __vericertSql?: SqlFn };

function getSql(): SqlFn {
  if (globalForDb.__vericertSql) return globalForDb.__vericertSql;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon Postgres connection string to .env.local " +
        "— see LAUNCH_CHECKLIST.md for how to create a free database."
    );
  }

  const sql = neon(connectionString);
  globalForDb.__vericertSql = sql;
  return sql;
}

// Generic parameterized query helper — use numbered placeholders ($1, $2, ...).
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  return (await getSql().query(text, params)) as T[];
}

