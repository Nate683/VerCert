// Test-only: a real local Postgres (embedded-postgres, scratch data dir) behind a Neon-HTTP-compatible /sql endpoint.
// A pg Pool gives real concurrent connections, so row locks and concurrent-order tests behave as on Neon.
// Usage: node pg-shim.mjs [--fresh]   → Postgres on 127.0.0.1:5491, shim on 127.0.0.1:5492.
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "pgdata-real");
const fresh = process.argv.includes("--fresh");
if (fresh && fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "demo", password: "demo", port: 5491, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C", "--no-sync"], postgresFlags: ["-c", "timezone=UTC", "-c", "max_connections=60"] });
if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) await server.initialise();
await server.start();
const admin = new pg.Client({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "postgres" });
await admin.connect();
if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname = 'demo'")).rowCount) await admin.query("CREATE DATABASE demo");
await admin.end();

// Neon's HTTP client expects every value as Postgres text; keep pg from parsing anything.
const raw = { getTypeParser: () => (v) => v };
const pool = new pg.Pool({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "demo", max: 20 });
// db-snapshot.mjs terminates connections to restore a snapshot; an idle client dying must not crash the shim.
pool.on("error", (e) => console.error("[shim] idle client error (ignored):", e.message));
const shape = (r) => ({
  fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
  command: r.command, rowCount: r.rowCount, rows: r.rows, rowAsArray: true,
});
const run = (c, q) => c.query({ text: q.query, values: q.params ?? [], rowMode: "array", types: raw });

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const client = await pool.connect();
    try {
      const j = JSON.parse(body);
      let out;
      if (Array.isArray(j.queries)) {
        await client.query("BEGIN");
        try { out = { results: [] }; for (const q of j.queries) out.results.push(shape(await run(client, q))); await client.query("COMMIT"); }
        catch (e) { await client.query("ROLLBACK"); throw e; }
      } else out = shape(await run(client, j));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: e.message, code: e.code, detail: e.detail, constraint: e.constraint }));
    } finally {
      client.release();
    }
  });
}).listen(5492, "127.0.0.1", () => console.log("shim ready on 5492 (real Postgres 5491)"));

const stop = async () => { await pool.end().catch(() => {}); await server.stop().catch(() => {}); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
