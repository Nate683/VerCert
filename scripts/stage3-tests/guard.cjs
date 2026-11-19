// Network guard for the demo: the demo DB host goes to the local shim; only
// localhost and Google Fonts are reachable; everything else (prod Neon, Resend,
// Anthropic, Coinbase, Blob, Twilio...) is refused.
const real = globalThis.fetch;
// GUARD_EXTRA_ALLOW (comma-separated exact hostnames) opens specific public hosts for one run only, e.g. the
// Vanguard test lets the real link checker GET verifiedbyvanguard.com. Prod DB/service hosts stay blocked.
const ALLOW = new Set(["localhost", "127.0.0.1", "fonts.googleapis.com", "fonts.gstatic.com",
  ...(process.env.GUARD_EXTRA_ALLOW || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)]);
if (process.env.GUARD_EXTRA_ALLOW) console.error(`[guard] extra allowed hosts: ${process.env.GUARD_EXTRA_ALLOW}`);
globalThis.fetch = async function (input, init) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname.endsWith(".invalid")) return real("http://127.0.0.1:5492/sql", init ?? (typeof input === "object" && !(input instanceof URL) ? input : undefined));
  if (!ALLOW.has(url.hostname)) { console.error(`[guard] BLOCKED ${url.hostname}`); throw new Error(`[guard] blocked ${url.hostname}`); }
  return real(input, init);
};
