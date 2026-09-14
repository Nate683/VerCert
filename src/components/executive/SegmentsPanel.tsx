"use client";

import { Fragment, useEffect, useState } from "react";
import type { CustomerMetrics } from "@/lib/marketing/customer-metrics";
import type { CustomerRecord } from "@/lib/marketing/customer-record";
import type { SegmentOptions, SegmentSummary } from "@/lib/marketing/segments";
import { heardAboutLabel } from "@/lib/marketing/heard-about";
import { Empty, Panel, Readout } from "./Chrome";

type Filters = {
  history: "all" | "never" | "first-time" | "repeat";
  lapsedDays: string;
  minLtv: string;
  category: string;
  referral: "all" | "affiliate" | "direct";
  affiliateId: string;
  abandonedWithinDays: string;
  optedInOnly: boolean;
};

const DEFAULT_FILTERS: Filters = {
  history: "all",
  lapsedDays: "",
  minLtv: "",
  category: "",
  referral: "all",
  affiliateId: "",
  abandonedWithinDays: "",
  optedInOnly: true,
};

// Starting points for the campaigns that come up most. Each one only sets
// filters, so it can be adjusted from there.
const PRESETS: { label: string; filters: (options: SegmentOptions | null) => Filters }[] = [
  { label: "Lapsed repeat buyers", filters: () => ({ ...DEFAULT_FILTERS, history: "repeat", lapsedDays: "60" }) },
  {
    label: "High value",
    filters: (options) => ({
      ...DEFAULT_FILTERS,
      minLtv: options?.highValueThreshold ? String(Math.floor(options.highValueThreshold)) : "",
    }),
  },
  { label: "First-time buyers", filters: () => ({ ...DEFAULT_FILTERS, history: "first-time" }) },
  { label: "Never ordered", filters: () => ({ ...DEFAULT_FILTERS, history: "never" }) },
  { label: "Abandoned cart, 7 days", filters: () => ({ ...DEFAULT_FILTERS, abandonedWithinDays: "7" }) },
  { label: "Affiliate-referred", filters: () => ({ ...DEFAULT_FILTERS, referral: "affiliate" }) },
];

function toQuery(f: Filters): string {
  const params = new URLSearchParams();
  if (f.history !== "all") params.set("history", f.history);
  if (f.lapsedDays) params.set("lapsedDays", f.lapsedDays);
  if (f.minLtv) params.set("minLtv", f.minLtv);
  if (f.category) params.set("category", f.category);
  if (f.referral !== "all") params.set("referral", f.referral);
  if (f.referral === "affiliate" && f.affiliateId) params.set("affiliateId", f.affiliateId);
  if (f.abandonedWithinDays) params.set("abandonedWithinDays", f.abandonedWithinDays);
  if (!f.optedInOnly) params.set("optedInOnly", "false");
  return params.toString();
}

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fullName = (c: { firstName: string; lastName: string; email: string }) =>
  `${c.firstName} ${c.lastName}`.trim() || c.email;

function lastOrderLabel(days?: number): string {
  if (days === undefined) return "—";
  return days === 0 ? "Today" : `${days}d ago`;
}

function sourceLabel(c: CustomerMetrics): string {
  if (c.affiliateName) return `Affiliate · ${c.affiliateName}`;
  const a = c.attribution;
  if (a?.utmSource) return a.utmCampaign ? `${a.utmSource} · ${a.utmCampaign}` : a.utmSource;
  if (a?.referrer) return a.referrer;
  return heardAboutLabel(c.heardAbout) ?? "—";
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="command-label command-label--dim block text-[11px]">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-[var(--cmd-bone-faint)]">{hint}</p>}
    </div>
  );
}

export function SegmentsPanel() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [customers, setCustomers] = useState<CustomerMetrics[]>([]);
  const [summary, setSummary] = useState<SegmentSummary | null>(null);
  const [options, setOptions] = useState<SegmentOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, CustomerRecord | "error">>({});

  const query = toQuery(filters);

  useEffect(() => {
    const controller = new AbortController();
    // Debounced, so typing a threshold doesn't fire a request per keystroke.
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/executive/segments?${query}`, { cache: "no-store", signal: controller.signal })
        .then((res) => res.json())
        .then((data) => {
          setCustomers(data.customers ?? []);
          setSummary(data.summary ?? null);
          setOptions(data.options ?? null);
          setLoading(false);
        })
        .catch((err) => {
          if (!(err instanceof DOMException && err.name === "AbortError")) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function toggleCustomer(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (records[id]) return;
    try {
      const res = await fetch(`/api/executive/customers/${id}`, { cache: "no-store" });
      const data = await res.json();
      setRecords((prev) => ({ ...prev, [id]: res.ok ? data.record : "error" }));
    } catch {
      setRecords((prev) => ({ ...prev, [id]: "error" }));
    }
  }

  const exportHref = `/api/executive/segments?${query ? `${query}&` : ""}format=csv`;

  return (
    <div className="space-y-4">
      <Panel variant="command" title="Build a Segment" meta={loading ? "Updating…" : undefined} bodyClassName="px-6 pb-6 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="command-label command-label--dim mr-1 text-[11px]">Start from</span>
          {PRESETS.map((preset) => {
            const presetQuery = toQuery(preset.filters(options));
            const active = presetQuery !== "" && presetQuery === query;
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() => setFilters(preset.filters(options))}
                className={`border px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  active
                    ? "border-[var(--cmd-brass)] bg-[var(--cmd-oxblood)]/60 text-[var(--cmd-brass-bright)]"
                    : "border-[var(--cmd-brass)]/30 text-[var(--cmd-bone-dim)] hover:border-[var(--cmd-brass)] hover:text-[var(--cmd-bone)]"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          {query !== "" && (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="px-2 py-1.5 text-[11px] uppercase tracking-[0.14em] text-[var(--cmd-bone-faint)] underline-offset-4 hover:text-[var(--cmd-bone)] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Field id="segment-history" label="Purchase history">
            <select
              id="segment-history"
              value={filters.history}
              onChange={(e) => update("history", e.target.value as Filters["history"])}
              className="input-field"
            >
              <option value="all">Everyone</option>
              <option value="never">Registered, never ordered</option>
              <option value="first-time">First-time buyers (1 order)</option>
              <option value="repeat">Repeat buyers (2+ orders)</option>
            </select>
          </Field>
          <Field id="segment-lapsed" label="Lapsed: no order in (days)" hint="Only counts customers who have ordered before.">
            <input
              id="segment-lapsed"
              type="number"
              min={1}
              inputMode="numeric"
              value={filters.lapsedDays}
              onChange={(e) => update("lapsedDays", e.target.value)}
              placeholder="e.g. 60"
              className="input-field"
            />
          </Field>
          <Field
            id="segment-ltv"
            label="Lifetime value at least ($)"
            hint={
              options?.highValueThreshold
                ? `Your top 20% of buyers start at ${usd(options.highValueThreshold)}.`
                : undefined
            }
          >
            <input
              id="segment-ltv"
              type="number"
              min={0}
              inputMode="decimal"
              value={filters.minLtv}
              onChange={(e) => update("minLtv", e.target.value)}
              placeholder="e.g. 500"
              className="input-field"
            />
          </Field>
          <Field id="segment-category" label="Buys mostly">
            <select
              id="segment-category"
              value={filters.category}
              onChange={(e) => update("category", e.target.value)}
              className="input-field"
            >
              <option value="">Any category</option>
              {(options?.categories ?? []).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field id="segment-referral" label="Referral">
            <select
              id="segment-referral"
              value={filters.referral}
              onChange={(e) => update("referral", e.target.value as Filters["referral"])}
              className="input-field"
            >
              <option value="all">Everyone</option>
              <option value="affiliate">Referred by an affiliate</option>
              <option value="direct">Not affiliate-referred</option>
            </select>
          </Field>
          {filters.referral === "affiliate" && (options?.affiliates.length ?? 0) > 0 && (
            <Field id="segment-affiliate" label="Affiliate">
              <select
                id="segment-affiliate"
                value={filters.affiliateId}
                onChange={(e) => update("affiliateId", e.target.value)}
                className="input-field"
              >
                <option value="">Any affiliate</option>
                {(options?.affiliates ?? []).map((affiliate) => (
                  <option key={affiliate.id} value={affiliate.id}>
                    {affiliate.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field id="segment-abandoned" label="Abandoned a cart">
            <select
              id="segment-abandoned"
              value={filters.abandonedWithinDays}
              onChange={(e) => update("abandonedWithinDays", e.target.value)}
              className="input-field"
            >
              <option value="">Doesn&apos;t matter</option>
              <option value="7">In the last 7 days</option>
              <option value="30">In the last 30 days</option>
              <option value="90">In the last 90 days</option>
            </select>
          </Field>
        </div>

        <label htmlFor="segment-consent" className="mt-6 flex items-start gap-3 text-sm text-[var(--cmd-bone-dim)]">
          <input
            id="segment-consent"
            type="checkbox"
            checked={filters.optedInOnly}
            onChange={(e) => update("optedInOnly", e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-gold"
          />
          <span>
            Only customers who opted in to marketing email
            <span className="block text-[11px] text-[var(--cmd-bone-faint)]">Leave this on for any list you&apos;ll email.</span>
          </span>
        </label>
      </Panel>

      <Panel
        variant="command"
        title="Segment"
        tone="blood"
        meta={summary ? `${summary.matched} of ${summary.totalCustomers} customers` : "Loading"}
        bodyClassName="px-2 py-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <dl className="grid flex-1 grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-[var(--cmd-brass)]/15">
            <Readout variant="command" label="Customers" size="lg" className="px-4 py-2">
              {summary?.matched ?? 0}
            </Readout>
            <Readout variant="command" label="Combined lifetime value" size="lg" className="px-4 py-2">
              {usd(summary?.lifetimeValue ?? 0)}
            </Readout>
            <Readout variant="command" label="Average lifetime value" size="lg" className="px-4 py-2">
              {usd(summary?.averageLifetimeValue ?? 0)}
            </Readout>
            <Readout
              variant="command"
              label={filters.optedInOnly ? "Left out: no email consent" : "Without email consent"}
              size="lg"
              className="px-4 py-2"
            >
              {summary?.withoutConsent ?? 0}
            </Readout>
          </dl>
          {summary && summary.matched > 0 ? (
            <a
              href={exportHref}
              className="mx-4 mb-2 border border-[var(--cmd-brass)]/60 px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] text-[var(--cmd-brass-bright)] transition-colors hover:bg-[var(--cmd-brass)] hover:text-black"
            >
              Export CSV
            </a>
          ) : (
            <span className="mx-4 mb-2 border border-white/10 px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] text-white/25">
              Export CSV
            </span>
          )}
        </div>
      </Panel>

      <Panel variant="command" title="Customers in Segment" meta={`${customers.length}`} bodyClassName="px-4 pb-4 pt-2">
        {customers.length === 0 ? (
          <Empty variant="command">{loading ? "Loading customers…" : "No customers match this segment."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
                  <th className="py-3 pr-4 font-normal">Customer</th>
                  <th className="py-3 pr-4 font-normal">Orders</th>
                  <th className="py-3 pr-4 font-normal">Lifetime value</th>
                  <th className="py-3 pr-4 font-normal">Avg order</th>
                  <th className="py-3 pr-4 font-normal">Last order</th>
                  <th className="py-3 pr-4 font-normal">Reorders</th>
                  <th className="py-3 pr-4 font-normal">Buys mostly</th>
                  <th className="py-3 pr-4 font-normal">Source</th>
                  <th className="py-3 pr-4 font-normal">Email opens / clicks</th>
                  <th className="py-3 font-normal">Consent</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="border-b border-white/5 align-top text-white/80">
                      <td className="py-3 pr-4">
                        <button
                          type="button"
                          onClick={() => toggleCustomer(c.id)}
                          aria-expanded={expandedId === c.id}
                          className="group text-left"
                        >
                          <span className="block text-[var(--cmd-bone)] group-hover:text-[var(--cmd-brass-bright)]">
                            {fullName(c)}
                          </span>
                          <span className="block text-xs text-white/45">{c.email}</span>
                          {c.company && <span className="block text-[11px] text-white/35">{c.company}</span>}
                        </button>
                        {c.abandonedCartAt && (
                          <span className="mt-1.5 block w-fit border border-[var(--cmd-oxblood)] bg-[var(--cmd-oxblood)]/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--cmd-bone-dim)]">
                            Cart left {shortDate(c.abandonedCartAt)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono">{c.orderCount}</td>
                      <td className="py-3 pr-4 font-mono text-[var(--cmd-brass-bright)]">{usd(c.lifetimeValue)}</td>
                      <td className="py-3 pr-4 font-mono">{c.orderCount ? usd(c.averageOrderValue) : "—"}</td>
                      <td className="py-3 pr-4 text-xs">{lastOrderLabel(c.daysSinceLastOrder)}</td>
                      <td className="py-3 pr-4 text-xs">
                        {c.reorderIntervalDays === undefined ? "—" : `Every ~${c.reorderIntervalDays}d`}
                      </td>
                      <td className="py-3 pr-4 text-xs">{c.topCategory ?? "—"}</td>
                      <td className="py-3 pr-4 text-xs">{sourceLabel(c)}</td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {c.emailOpens || c.emailClicks ? `${c.emailOpens} / ${c.emailClicks}` : "—"}
                      </td>
                      <td className="py-3 text-xs">
                        {c.marketingOptIn ? (
                          <span className="text-[var(--cmd-brass-bright)]">Opted in</span>
                        ) : (
                          <span className="text-white/30">No</span>
                        )}
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <td colSpan={10} className="px-4 py-5">
                          <CustomerDetail record={records[c.id]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="command-label command-label--dim text-[11px]">{title}</p>
      <div className="mt-2 text-xs text-white/65">{children}</div>
    </div>
  );
}

function CustomerDetail({ record }: { record?: CustomerRecord | "error" }) {
  if (!record) return <p className="text-xs text-white/40">Loading customer record…</p>;
  if (record === "error") return <p className="text-xs text-red-300">Couldn&apos;t load this customer&apos;s record.</p>;

  const views = record.browsing.filter((e) => e.event === "product_view").slice(0, 8);
  const source = record.account.firstVisitSource;
  const profile = record.marketingProfile;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <DetailBlock title="Order History">
          {record.orders.length === 0 ? (
            <p className="text-white/35">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {record.orders.map((o) => (
                <li key={o.reference} className="py-2.5 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-[var(--cmd-bone)]">{o.reference}</span>
                    <span className="text-white/45">
                      {shortDate(o.placedAt)} · {o.status.replace("_", " ")}
                    </span>
                    <span className="font-mono text-[var(--cmd-brass-bright)]">{usd(o.totalUsd)}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-white/55">
                    {o.items.map((item, i) => (
                      <li key={`${item.slug}-${i}`}>
                        {item.product} ({item.size}) × {item.quantity}
                        {item.lotNumber && <span className="font-mono text-white/40"> · Lot {item.lotNumber}</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </DetailBlock>
      </div>

      <div className="space-y-6">
        <DetailBlock title="Profile">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-white/40">Customer since</dt>
            <dd>{shortDate(record.account.createdAt)}</dd>
            <dt className="text-white/40">First order</dt>
            <dd>{profile?.firstOrderAt ? shortDate(profile.firstOrderAt) : "—"}</dd>
            <dt className="text-white/40">Heard via</dt>
            <dd>{record.account.heardAboutUs ?? "—"}</dd>
            <dt className="text-white/40">Affiliate</dt>
            <dd>{record.account.referredByAffiliate ?? "—"}</dd>
            <dt className="text-white/40">First visit</dt>
            <dd>
              {source
                ? [source.utmSource, source.utmCampaign, source.referrer, source.ref && `ref ${source.ref}`]
                    .filter(Boolean)
                    .join(" · ") || source.landingPath
                : "—"}
            </dd>
          </dl>
        </DetailBlock>
        <DetailBlock title="Recently Viewed">
          {views.length === 0 ? (
            <p className="text-white/35">No product views recorded.</p>
          ) : (
            <ul className="space-y-0.5">
              {views.map((view, i) => (
                <li key={`${view.at}-${i}`} className="flex justify-between gap-3">
                  <span>{view.product}</span>
                  <span className="text-white/35">{shortDate(view.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </DetailBlock>
        <DetailBlock title="Email">
          {profile && (profile.emailOpens || profile.emailClicks) ? (
            <p>
              {profile.emailOpens} opens · {profile.emailClicks} clicks
              {profile.lastEmailEngagementAt && ` · last ${shortDate(profile.lastEmailEngagementAt)}`}
            </p>
          ) : (
            <p className="text-white/35">No email engagement recorded.</p>
          )}
        </DetailBlock>
      </div>
    </div>
  );
}
