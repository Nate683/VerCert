// LOCAL TEST POSTGRES ONLY (127.0.0.1:5491, embedded, scratch data dir). Saves or restores the "demo" database as a
// template copy, so test suites can start from a known state.
//   node db-snapshot.mjs save <name>      demo → snap_<name>
//   node db-snapshot.mjs restore <name>   snap_<name> → demo (drops the current demo)
//   node db-snapshot.mjs list
import pg from "pg";
const [mode, name] = process.argv.slice(2);
const c = new pg.Client({ host: "127.0.0.1", port: 5491, user: "demo", password: "demo", database: "postgres" });
await c.connect();
const kick = (db) => c.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [db]);
if (mode === "save") {
  await c.query(`DROP DATABASE IF EXISTS "snap_${name}"`);
  await kick("demo");
  await c.query(`CREATE DATABASE "snap_${name}" TEMPLATE demo`);
  console.log(`saved demo → snap_${name}`);
} else if (mode === "restore") {
  await kick("demo");
  await c.query(`DROP DATABASE IF EXISTS demo`);
  await c.query(`CREATE DATABASE demo TEMPLATE "snap_${name}"`);
  console.log(`restored snap_${name} → demo`);
} else {
  console.log((await c.query("SELECT datname FROM pg_database WHERE datname LIKE 'snap_%' ORDER BY 1")).rows.map((r) => r.datname).join("\n"));
}
await c.end();
