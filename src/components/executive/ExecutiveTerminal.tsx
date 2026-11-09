"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ExecutiveOverview } from "@/lib/executive/stats";
import type { LowInventoryAlert } from "@/lib/inventory";
import type { HqMember } from "@/lib/hq";
import { ChatPanel } from "@/components/hq/ChatPanel";
import { RevenueChart } from "./RevenueChart";
import { TopProducts } from "./TopProducts";
import { LowInventory } from "./LowInventory";
import { ActivityFeed } from "./ActivityFeed";
import { OrderTable } from "./OrderTable";
import { CustomersPanel } from "./CustomersPanel";
import { AssistantChat } from "./AssistantChat";
import { ProductsPanel } from "./ProductsPanel";
import { SubscriptionsPanel } from "./SubscriptionsPanel";
import { PromotionsPanel } from "./PromotionsPanel";
import { SiteContentPanel } from "./SiteContentPanel";
import { AnnouncementsPanel } from "./AnnouncementsPanel";
import { FinancialsPanel } from "./FinancialsPanel";
import { IntelligencePanel } from "./IntelligencePanel";
import { AffiliatesPanel } from "./AffiliatesPanel";
import { InviteCodesPanel } from "./InviteCodesPanel";
import { AdminPanel } from "./AdminPanel";
import { LedgerPanel } from "./LedgerPanel";
import { BriefingPanel } from "./BriefingPanel";
import { GoalsPanel } from "./GoalsPanel";
import { ForecastingPanel } from "./ForecastingPanel";
import { AlertsPanel } from "./AlertsPanel";
import { DocumentsPanel } from "./DocumentsPanel";
import { CalendarPanel } from "./CalendarPanel";
import { SegmentsPanel } from "./SegmentsPanel";
import { SubscribersPanel } from "./SubscribersPanel";
import { LiveIndicator } from "./LiveIndicator";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";
import { ChangeBadge } from "./ChangeBadge";
import { Panel, type Variant } from "./Chrome";

type Tab =
  | "overview"
  | "briefing"
  | "orders"
  | "products"
  | "financials"
  | "ledger"
  | "goals"
  | "forecasting"
  | "alerts"
  | "intelligence"
  | "customers"
  | "segments"
  | "assistant"
  | "admin"
  | "promotions"
  | "affiliates"
  | "invite-codes"
  | "content"
  | "documents"
  | "calendar"
  | "chat"
  | "subscriptions"
  | "newsletter"
  | "announcements";

// Tab names stay plain business English — no codenames, no jargon. The room
// may be theatrical; the filing labels are not.
const BASE_TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "briefing", label: "Briefing" },
  { id: "financials", label: "Revenue" },
  { id: "orders", label: "Orders" },
  { id: "products", label: "Inventory" },
  { id: "ledger", label: "Ledger" },
  { id: "goals", label: "Goals" },
  { id: "forecasting", label: "Forecast" },
  { id: "alerts", label: "Alerts" },
  { id: "intelligence", label: "Analytics" },
  { id: "customers", label: "Customers" },
  { id: "affiliates", label: "Affiliates" },
  { id: "documents", label: "Documents" },
  { id: "calendar", label: "Calendar" },
  { id: "chat", label: "Messages" },
  { id: "assistant", label: "Assistant" },
  { id: "admin", label: "Admin" },
];

// Once /command-only; since 2026-11-08 both realms see them (full parity).
// Kept as a separate list so they stay grouped after the everyday tabs.
const COMMAND_ONLY_TABS: { id: Tab; label: string }[] = [
  { id: "segments", label: "Segments" },
  { id: "newsletter", label: "Subscribers" },
  { id: "promotions", label: "Promotions" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "invite-codes", label: "Invite Codes" },
  { id: "content", label: "Site Content" },
  { id: "announcements", label: "Announcement Banners" },
];

export function ExecutiveTerminal({
  variant,
  executiveName,
  executiveTitle,
  terminalName,
}: {
  variant: Variant;
  executiveName: string;
  executiveTitle: string;
  terminalName: string;
}) {
  const router = useRouter();
  // Both realms get every tab (owner gave /office full parity, 2026-11-08).
  const TABS = [...BASE_TABS, ...COMMAND_ONLY_TABS];
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
  const [lowInventory, setLowInventory] = useState<LowInventoryAlert[]>([]);
  const [hqMember, setHqMember] = useState<HqMember | null>(null);
  const [stamp, setStamp] = useState("");

  const loadOverview = useCallback(() => {
    return fetch("/api/executive/overview", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setOverview(data.overview ?? null);
        setLowInventory(data.lowInventory ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadOverview();
    fetch("/api/hq/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHqMember(data?.member ?? null))
      .catch(() => {});
  }, [loadOverview]);

  // The masthead date stamp is rendered only after mount — the server has no
  // way to know the reader's timezone, and a mismatch would hydrate wrong.
  useEffect(() => {
    function tick() {
      setStamp(
        new Date().toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Poll for fresh revenue/order/activity data so the dashboard reflects
  // sales as they happen, without requiring a manual page reload.
  useLiveRefresh(loadOverview);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/executive");
    router.refresh();
  }

  return (
    <div className="exec-shell">
      <Masthead
        executiveName={executiveName}
        executiveTitle={executiveTitle}
        terminalName={terminalName}
        stamp={stamp}
        onLogout={handleLogout}
      />

      <div className="relative mx-auto max-w-[1600px] px-4 pb-16 lg:px-8">
        <nav
          role="tablist"
          aria-label="Terminal sections"
          className="flex items-end gap-x-1 overflow-x-auto border-b border-[var(--x-border)] lg:flex-wrap lg:overflow-visible"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="command-tab"
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-8">
          {tab === "overview" && (
            <div className="space-y-5">
              <LiveIndicator variant={variant} asOf={overview?.computedAt} />
              <Overview overview={overview} lowInventory={lowInventory} variant={variant} />
            </div>
          )}

          {tab === "briefing" && <BriefingPanel variant={variant} />}
          {tab === "orders" && <OrderTable variant={variant} />}
          {tab === "products" && <ProductsPanel variant={variant} />}
          {tab === "financials" && <FinancialsPanel variant={variant} />}
          {tab === "ledger" && <LedgerPanel variant={variant} />}
          {tab === "goals" && <GoalsPanel variant={variant} />}
          {tab === "forecasting" && <ForecastingPanel variant={variant} />}
          {tab === "alerts" && <AlertsPanel variant={variant} />}
          {tab === "intelligence" && <IntelligencePanel variant={variant} />}
          {tab === "promotions" && <PromotionsPanel />}
          {tab === "subscriptions" && <SubscriptionsPanel />}
          {tab === "affiliates" && <AffiliatesPanel variant={variant} />}
          {tab === "invite-codes" && <InviteCodesPanel />}
          {tab === "content" && <SiteContentPanel />}
          {tab === "announcements" && <AnnouncementsPanel />}
          {tab === "documents" && <DocumentsPanel variant={variant} />}
          {tab === "calendar" && <CalendarPanel variant={variant} />}
          {tab === "customers" && <CustomersPanel variant={variant} />}
          {tab === "segments" && <SegmentsPanel />}
          {tab === "newsletter" && <SubscribersPanel />}
          {tab === "chat" &&
            (hqMember ? (
              <div className="exec-chat">
                <ChatPanel member={hqMember} />
              </div>
            ) : (
              <p className="text-sm text-white/40">Loading messages…</p>
            ))}
          {tab === "assistant" && <AssistantChat variant={variant} />}
          {tab === "admin" && <AdminPanel variant={variant} />}
        </div>
      </div>
    </div>
  );
}

// --- Masthead ------------------------------------------------------------

type MastheadProps = {
  executiveName: string;
  executiveTitle: string;
  terminalName: string;
  stamp: string;
  onLogout: () => void;
};

// One quiet header for both portals: who is signed in, the time, log out.
function Masthead({ executiveName, executiveTitle, terminalName, stamp, onLogout }: MastheadProps) {
  return (
    <header className="border-b border-[var(--x-border)]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pb-5 pt-6 lg:px-8">
        <div>
          <p className="exec-label">{terminalName}</p>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-[var(--x-text)]">{executiveName}</h1>
          <p className="mt-0.5 text-xs text-[var(--x-muted)]">{executiveTitle}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs tabular-nums text-[var(--x-muted)]">{stamp || " "}</span>
          <button
            type="button"
            onClick={onLogout}
            className="border border-[var(--x-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--x-text-2)] transition-colors duration-150 hover:border-[var(--x-muted)] hover:text-[var(--x-text)]"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}

// --- Overview ------------------------------------------------------------

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The figures that matter most, stated plainly across the top; the curve and the
// standing reports below. The same layout and the same data for both portals.
function Overview({
  overview,
  lowInventory,
  variant,
}: {
  overview: ExecutiveOverview | null;
  lowInventory: LowInventoryAlert[];
  variant: Variant;
}) {
  const summary: { label: string; value: string; note: ReactNode }[] = [
    {
      label: "Revenue — Today",
      value: usd(overview?.revenueToday ?? 0),
      note: (
        <>
          <ChangeBadge changePercent={overview?.revenueTodayChangePercent ?? null} /> vs yesterday
        </>
      ),
    },
    {
      label: "Revenue — Month to Date",
      value: usd(overview?.revenueMtd ?? 0),
      note: (
        <>
          <ChangeBadge changePercent={overview?.revenueMtdChangePercent ?? null} /> vs last month
        </>
      ),
    },
    {
      label: "Orders Placed",
      value: String(overview?.orderCount ?? 0),
      note: "All time",
    },
    {
      label: "Average Order Value",
      value: usd(overview?.averageOrderValue ?? 0),
      note: "All time",
    },
    {
      label: "Awaiting Payment",
      value: usd(overview?.pendingPaymentsAmount ?? 0),
      note: `${overview?.pendingPaymentsCount ?? 0} order(s)`,
    },
  ];

  return (
    <div className="space-y-10">
      {/* Summary row: hairlines between figures, no boxes. */}
      {/* A 1px gap over the border colour draws the hairlines between cells at any column count. */}
      <dl className="grid grid-cols-2 gap-px border-y border-[var(--x-border)] bg-[var(--x-border)] sm:grid-cols-3 xl:grid-cols-5">
        {summary.map((item, i) => (
          <div
            key={item.label}
            className={`bg-[var(--x-base)] px-4 py-5 sm:px-5 ${i === summary.length - 1 ? "max-sm:col-span-2" : ""}`}
          >
            <dt className="exec-label">{item.label}</dt>
            <dd className="exec-figure mt-2 text-[1.625rem] leading-none sm:text-[2rem]">{item.value}</dd>
            <dd className="mt-2 text-[11px] text-[var(--x-muted)]">{item.note}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <RevenueChart series={overview?.chartSeries ?? []} variant={variant} />
        </div>
        <div className="lg:col-span-4">
          <Panel variant={variant} title="Position" meta="Live" className="h-full" bodyClassName="px-5 py-2">
            <dl className="divide-y divide-[var(--x-border)]">
              {[
                ["Revenue — All Time", usd(overview?.revenueAllTime ?? 0)],
                ["Revenue — Yesterday", usd(overview?.revenueYesterday ?? 0)],
                ["Outstanding Orders", String(overview?.pendingPaymentsCount ?? 0)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-3.5">
                  <dt className="exec-label">{label}</dt>
                  <dd className="exec-figure text-lg">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <TopProducts products={overview?.topProducts ?? []} variant={variant} />
        <LowInventory alerts={lowInventory} variant={variant} />
        <ActivityFeed events={overview?.recentActivity ?? []} variant={variant} />
      </div>
    </div>
  );
}
