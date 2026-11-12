"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ExecutiveOverview } from "@/lib/executive/stats";
import type { LowInventoryAlert } from "@/lib/inventory";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";

// PROTOTYPE — Direction A ("Ledger") for the executive portal, Overview page only. Approved for prototyping
// 2026-11-10; nothing else in the portal uses it until the owner approves this page.
//
// Same data and refresh as the current Overview (/api/executive/overview every 20 s). Light paper ground, ink
// text, navy structure; gold only marks the current page and keyboard focus. IBM Plex Sans for the interface,
// IBM Plex Mono for every figure. Rules instead of boxes. No gradients, shadows, glow or animation.
// Navigation is the full 25-page list in six groups; every page except Overview opens the current portal.

type Variant = "command" | "office";

const TOKENS = {
  "--l-ground": "#F5F4F0",
  "--l-surface": "#FFFFFF",
  "--l-rule": "#E1DED5",
  "--l-rule-strong": "#C8C3B5",
  "--l-text": "#15191E",
  "--l-text-2": "#59606A",
  "--l-text-3": "#8A9097",
  "--l-navy": "#0F2448",
  "--l-gold": "#B08C50",
  "--l-positive": "#2E6A4E",
  "--l-caution": "#8A6A1E",
  "--l-negative": "#9A3A32",
  "--l-neutral": "#3E5A7E",
} as CSSProperties;

const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  { group: "Today", items: [{ id: "overview", label: "Overview" }, { id: "briefing", label: "Briefing" }, { id: "alerts", label: "Alerts" }] },
  { group: "Money", items: [{ id: "financials", label: "Revenue" }, { id: "ledger", label: "Ledger" }, { id: "goals", label: "Goals" }, { id: "forecasting", label: "Forecast" }] },
  { group: "Operations", items: [{ id: "orders", label: "Orders" }, { id: "products", label: "Inventory" }, { id: "certificates", label: "Certificates" }, { id: "subscriptions", label: "Subscriptions" }] },
  {
    group: "Customers",
    items: [
      { id: "customers", label: "Customers" }, { id: "intelligence", label: "Analytics" }, { id: "segments", label: "Segments" },
      { id: "newsletter", label: "Subscribers" }, { id: "affiliates", label: "Affiliates" }, { id: "invite-codes", label: "Invite Codes" },
      { id: "promotions", label: "Promotions" },
    ],
  },
  { group: "Site", items: [{ id: "content", label: "Site Content" }, { id: "announcements", label: "Announcement Banners" }] },
  { group: "Workspace", items: [{ id: "documents", label: "Documents" }, { id: "calendar", label: "Calendar" }, { id: "chat", label: "Messages" }, { id: "assistant", label: "Assistant" }] },
  { group: "System", items: [{ id: "admin", label: "Admin" }] },
];

const usd = (n: number, cents = true) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
const MONO = "font-[family-name:var(--font-ledger)] tabular-nums";
const LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--l-text-2)]";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--l-gold)]";

export function LedgerOverview({
  variant,
  executiveName,
  executiveTitle,
  fontClass,
}: {
  variant: Variant;
  executiveName: string;
  executiveTitle: string;
  fontClass: string;
}) {
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
  const [lowInventory, setLowInventory] = useState<LowInventoryAlert[]>([]);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stamp, setStamp] = useState("");

  const load = useCallback(() => {
    return fetch("/api/executive/overview", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        setOverview(data.overview ?? null);
        setLowInventory(data.lowInventory ?? []);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(load);

  // Date stamp only after mount: the server can't know the reader's timezone.
  useEffect(() => {
    const tick = () =>
      setStamp(new Date().toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/executive");
  }

  const updated = overview?.computedAt ? new Date(overview.computedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;

  return (
    <div style={TOKENS} className={`${fontClass} min-h-screen bg-[var(--l-ground)] font-[family-name:var(--font-plex-sans)] text-[13px] leading-[1.45] text-[var(--l-text)] antialiased`}>
      {/* Phones and tablets: a slim navy bar with the page list behind a button. */}
      <div className="flex items-center justify-between bg-[var(--l-navy)] px-4 py-3 text-white lg:hidden">
        <span className="text-[13px] font-semibold tracking-[0.02em]">VeriCert · Executive</span>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="ledger-nav"
          className={`border border-white/30 px-3 py-1.5 text-[12px] font-medium ${FOCUS}`}
        >
          {menuOpen ? "Close" : "Pages"}
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
        {/* The navy column runs the full page height; the list inside stays pinned while the page scrolls. */}
        <div className="bg-[var(--l-navy)]">
        <nav
          id="ledger-nav"
          aria-label="Executive pages"
          className={`${menuOpen ? "block" : "hidden"} bg-[var(--l-navy)] text-white lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto`}
        >
          <div className="hidden border-b border-white/10 px-5 pb-4 pt-5 lg:block">
            <p className="text-[13px] font-semibold tracking-[0.02em]">VeriCert</p>
            <p className="text-[11px] text-white/55">Executive {variant === "command" ? "Command" : "Office"}</p>
          </div>
          <div className="px-3 py-3">
            {NAV.map((g) => (
              <div key={g.group} className="mb-3">
                <p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/40">{g.group}</p>
                <ul>
                  {g.items.map((item) => {
                    const current = item.id === "overview";
                    return (
                      <li key={item.id}>
                        <a
                          href={current ? undefined : `/${variant}`}
                          aria-current={current ? "page" : undefined}
                          title={current ? undefined : "Opens in the current portal (prototype)"}
                          className={`block border-l-2 px-2 py-[5px] text-[13px] ${FOCUS} ${
                            current ? "border-[var(--l-gold)] bg-white/[0.06] font-medium text-white" : "border-transparent text-white/70 hover:text-white"
                          }`}
                        >
                          {item.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="border-t border-white/10 px-5 py-4 text-[11px] leading-snug text-white/45">
            Prototype. Pages other than Overview open the current portal.
          </p>
        </nav>
        </div>

        <main className="min-w-0">
          {/* Page header: title and freshness on the left, who is signed in on the right. */}
          <header className="border-b border-[var(--l-rule)] bg-[var(--l-surface)] px-4 py-4 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <div>
                <h1 className="text-[20px] font-semibold leading-tight">Overview</h1>
                <p className="mt-1 text-[12px] text-[var(--l-text-2)]">
                  {failed ? (
                    <span className="text-[var(--l-negative)]">Couldn&apos;t refresh. Showing the last figures received.</span>
                  ) : updated ? (
                    <>Updated {updated} · refreshes every 20 seconds</>
                  ) : (
                    "Loading…"
                  )}
                </p>
              </div>
              <div className="flex items-center gap-5">
                <div className="sm:text-right">
                  <p className="text-[13px] font-medium">{executiveName}</p>
                  <p className="text-[11px] text-[var(--l-text-2)]">{executiveTitle}</p>
                </div>
                <span className={`hidden text-[12px] text-[var(--l-text-2)] sm:inline ${MONO}`}>{stamp || " "}</span>
                <button
                  type="button"
                  onClick={logout}
                  className={`border border-[var(--l-rule-strong)] bg-[var(--l-surface)] px-3 py-1.5 text-[12px] font-medium hover:border-[var(--l-text-2)] ${FOCUS}`}
                >
                  Log out
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-8 px-4 py-6 sm:px-8">
            {/* Headline figures: one ruled row, no boxes. */}
            <section aria-label="Headline figures">
              <dl className="grid grid-cols-2 gap-px border border-[var(--l-rule)] bg-[var(--l-rule)] sm:grid-cols-3 xl:grid-cols-5">
                <Figure label="Revenue today" value={usd(overview?.revenueToday ?? 0)} note={<Change pct={overview?.revenueTodayChangePercent ?? null} against="yesterday" />} />
                <Figure label="Revenue month to date" value={usd(overview?.revenueMtd ?? 0)} note={<Change pct={overview?.revenueMtdChangePercent ?? null} against="same point last month" />} />
                <Figure label="Orders placed" value={(overview?.orderCount ?? 0).toLocaleString("en-US")} note="All time" />
                <Figure label="Average order value" value={usd(overview?.averageOrderValue ?? 0)} note="All time" />
                <Figure
                  label="Awaiting payment"
                  value={usd(overview?.pendingPaymentsAmount ?? 0)}
                  note={`${overview?.pendingPaymentsCount ?? 0} order${overview?.pendingPaymentsCount === 1 ? "" : "s"}`}
                  className="max-sm:col-span-2"
                />
              </dl>
            </section>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
              <Section title="Revenue, trailing fourteen days" meta={overview?.chartSeries?.length ? `${overview.chartSeries[0].date} – ${overview.chartSeries[overview.chartSeries.length - 1].date}` : undefined} className="xl:col-span-8">
                <Bars series={overview?.chartSeries ?? []} />
              </Section>
              <Section title="Position" className="xl:col-span-4">
                <dl className="divide-y divide-[var(--l-rule)]">
                  {[
                    ["Revenue, all time", usd(overview?.revenueAllTime ?? 0)],
                    ["Revenue, yesterday", usd(overview?.revenueYesterday ?? 0)],
                    ["Revenue, prior month to date", usd(overview?.revenueMtdPriorPeriod ?? 0)],
                    ["Outstanding orders", String(overview?.pendingPaymentsCount ?? 0)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                      <dt className="text-[var(--l-text-2)]">{label}</dt>
                      <dd className={`text-[14px] ${MONO}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            </div>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
              <Section title="Top products by revenue" meta={overview?.topProducts?.length ? `${overview.topProducts.length} listed` : undefined}>
                {overview?.topProducts?.length ? (
                  <Table
                    head={["#", "Product", "Units", "Revenue"]}
                    align={["right", "left", "right", "right"]}
                    rows={overview.topProducts.map((p, i) => [
                      <span key="n" className={`text-[var(--l-text-3)] ${MONO}`}>{i + 1}</span>,
                      p.name,
                      <span key="u" className={MONO}>{p.unitsSold.toLocaleString("en-US")}</span>,
                      <span key="r" className={MONO}>{usd(p.revenue, false)}</span>,
                    ])}
                  />
                ) : (
                  <Empty>No paid orders yet.</Empty>
                )}
              </Section>

              <Section title="Low inventory" meta={lowInventory.length ? `${lowInventory.length} below threshold` : "None below threshold"}>
                {lowInventory.length ? (
                  <Table
                    head={["Product", "On hand", "Threshold", "State"]}
                    align={["left", "right", "right", "left"]}
                    rows={lowInventory.map((a) => [
                      a.name,
                      <span key="q" className={MONO}>{a.quantity}</span>,
                      <span key="t" className={`text-[var(--l-text-2)] ${MONO}`}>{a.threshold}</span>,
                      a.quantity <= 0 ? <State key="s" tone="negative">Out of stock</State> : <State key="s" tone="caution">Low</State>,
                    ])}
                  />
                ) : (
                  <Empty>Every product is above its reorder threshold.</Empty>
                )}
              </Section>

              <Section title="Recent activity" meta={overview?.recentActivity?.length ? `${overview.recentActivity.length} ${overview.recentActivity.length === 1 ? "entry" : "entries"}` : undefined}>
                {overview?.recentActivity?.length ? (
                  <ol className="divide-y divide-[var(--l-rule)]">
                    {overview.recentActivity.map((e) => (
                      <li key={e.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 px-4 py-2">
                        <time dateTime={e.timestamp} className={`whitespace-nowrap text-[12px] text-[var(--l-text-2)] ${MONO}`}>
                          {new Date(e.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </time>
                        <span className="[overflow-wrap:anywhere]">{e.message}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty>No activity yet.</Empty>
                )}
              </Section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Figure({ label, value, note, className = "" }: { label: string; value: string; note: ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--l-surface)] px-4 py-4 sm:px-5 ${className}`}>
      <dt className={LABEL}>{label}</dt>
      <dd className={`mt-2 text-[22px] leading-none sm:text-[24px] ${MONO}`}>{value}</dd>
      <dd className="mt-2 text-[12px] text-[var(--l-text-2)]">{note}</dd>
    </div>
  );
}

// A change is always written out: sign, figure and what it is measured against. Colour only supports the words.
function Change({ pct, against }: { pct: number | null; against: string }) {
  if (pct === null) return <>No prior figure to compare</>;
  const flat = Math.abs(pct) < 0.05;
  const tone = flat ? "text-[var(--l-text-2)]" : pct > 0 ? "text-[var(--l-positive)]" : "text-[var(--l-negative)]";
  return (
    <>
      <span className={`${tone} ${MONO}`}>{flat ? "0.0%" : `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`}</span> vs {against}
    </>
  );
}

function Section({ title, meta, children, className = "" }: { title: string; meta?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`border border-[var(--l-rule)] bg-[var(--l-surface)] ${className}`}>
      <div className="flex items-baseline justify-between gap-4 border-b border-[var(--l-rule)] px-4 py-2.5">
        <h2 className={LABEL}>{title}</h2>
        {meta && <span className={`text-[11px] text-[var(--l-text-3)] ${MONO}`}>{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function Table({ head, rows, align }: { head: string[]; rows: ReactNode[][]; align: ("left" | "right")[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-[var(--l-rule)]">
          {head.map((h, i) => (
            <th key={h} scope="col" className={`whitespace-nowrap px-4 py-2 text-[11px] font-medium text-[var(--l-text-3)] ${align[i] === "right" ? "text-right" : "text-left"} ${i > 0 ? "pl-2" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--l-rule)]">
        {rows.map((r, ri) => (
          <tr key={ri} className="h-8">
            {r.map((c, ci) => (
              <td key={ci} className={`px-4 py-1.5 align-baseline ${align[ci] === "right" ? "text-right" : "text-left"} ${ci > 0 ? "pl-2" : ""} ${ci === 1 && align[1] === "left" ? "[overflow-wrap:anywhere]" : ""}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Written-out class names (Tailwind only generates classes it can find as literal text).
const TONE = {
  positive: { text: "text-[var(--l-positive)]", mark: "bg-[var(--l-positive)]" },
  caution: { text: "text-[var(--l-caution)]", mark: "bg-[var(--l-caution)]" },
  negative: { text: "text-[var(--l-negative)]", mark: "bg-[var(--l-negative)]" },
  neutral: { text: "text-[var(--l-neutral)]", mark: "bg-[var(--l-neutral)]" },
} as const;

// A state is always a word; the small square only supports it.
function State({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium ${TONE[tone].text}`}>
      <span aria-hidden="true" className={`inline-block h-[7px] w-[7px] ${TONE[tone].mark}`} />
      {children}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-[var(--l-text-2)]">{children}</p>;
}

// Daily revenue as plain bars on a ruled baseline: no curve smoothing, no gradient. Each bar carries its exact
// figure for screen readers and on hover; dates under every other bar.
function Bars({ series }: { series: { date: string; revenue: number }[] }) {
  if (!series.length) return <Empty>No revenue recorded in this period.</Empty>;
  const max = Math.max(...series.map((p) => p.revenue), 0);
  const total = series.reduce((s, p) => s + p.revenue, 0);
  const best = series.reduce((b, p) => (p.revenue > b.revenue ? p : b), series[0]);
  return (
    <div className="px-4 pb-4 pt-4">
      <dl className="mb-4 grid grid-cols-3 gap-4 border-b border-[var(--l-rule)] pb-3">
        <div>
          <dt className="text-[11px] text-[var(--l-text-2)]">Fourteen-day total</dt>
          <dd className={`mt-0.5 text-[15px] ${MONO}`}>{usd(total)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--l-text-2)]">Daily average</dt>
          <dd className={`mt-0.5 text-[15px] ${MONO}`}>{usd(total / series.length)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[var(--l-text-2)]">Best day</dt>
          <dd className={`mt-0.5 text-[15px] ${MONO}`}>{max > 0 ? `${usd(best.revenue)}` : "—"}</dd>
          {max > 0 && <dd className={`text-[11px] text-[var(--l-text-3)] ${MONO}`}>{best.date}</dd>}
        </div>
      </dl>
      <ol className="flex h-40 items-end gap-[3px] border-b border-[var(--l-rule-strong)]" aria-label="Daily revenue">
        {series.map((p) => (
          <li key={p.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${p.date}: ${usd(p.revenue)}`}>
            <span className="sr-only">{`${p.date}: ${usd(p.revenue)}`}</span>
            <span
              aria-hidden="true"
              className="block w-full bg-[var(--l-navy)]"
              style={{ height: max > 0 && p.revenue > 0 ? `${Math.max(2, (p.revenue / max) * 100)}%` : "1px", opacity: p.revenue > 0 ? 0.88 : 0.25 }}
            />
          </li>
        ))}
      </ol>
      <ol aria-hidden="true" className="mt-1.5 flex gap-[3px]">
        {series.map((p, i) => (
          <li key={p.date} className={`min-w-0 flex-1 truncate text-center text-[10px] text-[var(--l-text-3)] ${MONO}`}>
            {i % 2 === 0 ? p.date.replace(/^[A-Za-z]+ /, "") : ""}
          </li>
        ))}
      </ol>
    </div>
  );
}
