"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExecutiveOverview } from "@/lib/executive/stats";
import type { LowInventoryAlert } from "@/lib/inventory";
import type { HqMember } from "@/lib/hq";
import { ChatPanel } from "@/components/hq/ChatPanel";
import { Watermark } from "@/components/Watermark";
import { StatCard } from "./StatCard";
import { RevenueChart } from "./RevenueChart";
import { TopProducts } from "./TopProducts";
import { LowInventory } from "./LowInventory";
import { ActivityFeed } from "./ActivityFeed";
import { OrderTable } from "./OrderTable";
import { CustomersPanel } from "./CustomersPanel";
import { AssistantChat } from "./AssistantChat";
import { ProductsPanel } from "./ProductsPanel";
import { PromotionsPanel } from "./PromotionsPanel";
import { SiteContentPanel } from "./SiteContentPanel";
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
import { LiveIndicator } from "./LiveIndicator";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";
import { AnimatedNumber } from "./AnimatedNumber";
import { ChangeBadge } from "./ChangeBadge";
import { Panel, Readout, Rule, type Variant } from "./Chrome";

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
  | "assistant"
  | "admin"
  | "promotions"
  | "affiliates"
  | "invite-codes"
  | "content"
  | "documents"
  | "calendar"
  | "chat";

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

// Promotions and Content editing are /command-only — /office never sees
// these tabs. Affiliates is shared (both realms), but /office gets a
// read-only view — see AffiliatesPanel's `variant` prop. Invite codes grant
// instant affiliate access, so generating them is command-only too.
const COMMAND_ONLY_TABS: { id: Tab; label: string }[] = [
  { id: "promotions", label: "Promotions" },
  { id: "invite-codes", label: "Invite Codes" },
  { id: "content", label: "Site Content" },
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
  const isCommand = variant === "command";
  const TABS = isCommand ? [...BASE_TABS, ...COMMAND_ONLY_TABS] : BASE_TABS;
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
  const [lowInventory, setLowInventory] = useState<LowInventoryAlert[]>([]);
  const [hqMember, setHqMember] = useState<HqMember | null>(null);
  const [mounted, setMounted] = useState(false);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fade-in trigger + mount-time fetch
    setMounted(true);
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
    router.push("/login");
    router.refresh();
  }

  return (
    <div
      className={
        isCommand
          ? `command-shell min-h-screen ${mounted ? "command-fade-in" : "opacity-0"}`
          : "office-shell min-h-screen"
      }
    >
      {isCommand ? (
        <CommandMasthead
          executiveName={executiveName}
          executiveTitle={executiveTitle}
          terminalName={terminalName}
          stamp={stamp}
          onLogout={handleLogout}
        />
      ) : (
        <OfficeMasthead
          executiveName={executiveName}
          executiveTitle={executiveTitle}
          terminalName={terminalName}
          stamp={stamp}
          onLogout={handleLogout}
        />
      )}

      <div className="relative z-10 mx-auto max-w-[1600px] px-4 pb-16 lg:px-8">
        <nav
          role="tablist"
          aria-label="Terminal sections"
          className={`flex flex-wrap items-end gap-x-1 gap-y-1 ${
            isCommand ? "border-b border-[var(--cmd-brass)]/35" : "border-b border-[var(--office-border)] pb-2"
          }`}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={isCommand ? "command-tab" : "office-tab"}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-6">
          {tab === "overview" && (
            <div className="space-y-4">
              <LiveIndicator variant={variant} asOf={overview?.computedAt} />
              {isCommand ? (
                <CommandOverview overview={overview} lowInventory={lowInventory} />
              ) : (
                <OfficeOverview overview={overview} lowInventory={lowInventory} />
              )}
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
          {tab === "promotions" && isCommand && <PromotionsPanel />}
          {tab === "affiliates" && <AffiliatesPanel variant={variant} />}
          {tab === "invite-codes" && isCommand && <InviteCodesPanel />}
          {tab === "content" && isCommand && <SiteContentPanel />}
          {tab === "documents" && <DocumentsPanel variant={variant} />}
          {tab === "calendar" && <CalendarPanel variant={variant} />}
          {tab === "customers" && <CustomersPanel variant={variant} />}
          {tab === "chat" &&
            (hqMember ? (
              <ChatPanel member={hqMember} />
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

// --- Mastheads -----------------------------------------------------------

type MastheadProps = {
  executiveName: string;
  executiveTitle: string;
  terminalName: string;
  stamp: string;
  onLogout: () => void;
};

// Marble slab, brass plaque, embossed V, double gold rule with a centre
// crest. The one piece of the room that is allowed to be ceremonial.
function CommandMasthead({ executiveName, executiveTitle, terminalName, stamp, onLogout }: MastheadProps) {
  return (
    <header className="command-marble relative z-10 mb-6 border-b border-[var(--cmd-brass)]/30">
      <Watermark className="pointer-events-none absolute -top-16 right-4 h-72 w-72 opacity-[0.035]" />
      <div className="relative mx-auto flex max-w-[1600px] flex-wrap items-end justify-between gap-6 px-4 pb-6 pt-8 lg:px-8">
        <div>
          <p className="command-label text-[13px] tracking-[0.42em]">{terminalName}</p>
          <h1 className="command-heading mt-2 text-4xl lg:text-5xl">{executiveName}</h1>
          <p className="command-label command-label--dim mt-1 text-[12px] tracking-[0.22em]">
            {executiveTitle}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <span className="command-figure text-[11px] tracking-[0.16em] text-[var(--cmd-bone-dim)]">
            {stamp || " "}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="command-tab border border-[var(--cmd-brass)]/40 !bg-transparent hover:!bg-[var(--cmd-oxblood)]/40"
          >
            Log Out
          </button>
        </div>
      </div>
      <Rule variant="command" crest className="mx-auto max-w-[1600px]" />
    </header>
  );
}

function OfficeMasthead({ executiveName, executiveTitle, terminalName, stamp, onLogout }: MastheadProps) {
  return (
    <header className="mb-6 border-b border-[var(--office-border)] bg-[var(--office-panel)]/50">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-end justify-between gap-6 px-4 py-7 lg:px-8">
        <div>
          <p className="office-label office-gold">{terminalName}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--office-fg)]">
            {executiveName}
          </h1>
          <p className="mt-1 text-xs office-platinum">{executiveTitle}</p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <span className="text-[11px] office-platinum">{stamp || " "}</span>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-md border border-[var(--office-border)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] office-platinum transition-colors hover:border-[var(--office-gold)] hover:text-[var(--office-gold)]"
          >
            Log Out
          </button>
        </div>
      </div>
    </header>
  );
}

// --- Overviews -----------------------------------------------------------

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`;

// Fortune 500 density: the whole position on one screen. A headline figure,
// the fourteen-day curve beside it, a ledger strip of secondary figures, and
// three standing reports underneath.
function CommandOverview({
  overview,
  lowInventory,
}: {
  overview: ExecutiveOverview | null;
  lowInventory: LowInventoryAlert[];
}) {
  const ledger: { label: string; value: number; format: (n: number) => string; change?: number | null }[] = [
    {
      label: "Revenue — Month to Date",
      value: overview?.revenueMtd ?? 0,
      format: usd,
      change: overview?.revenueMtdChangePercent ?? null,
    },
    { label: "Revenue — All Time", value: overview?.revenueAllTime ?? 0, format: usd },
    { label: "Average Order Value", value: overview?.averageOrderValue ?? 0, format: usd },
    { label: "Orders Placed", value: overview?.orderCount ?? 0, format: (n) => String(Math.round(n)) },
    { label: "Outstanding", value: overview?.pendingPaymentsAmount ?? 0, format: usd },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="command-reveal lg:col-span-5" style={{ ["--reveal-delay" as string]: "0ms" }}>
          <Panel
            variant="command"
            title="Revenue — Today"
            meta={overview ? "Posted" : "Loading"}
            tone="blood"
            engraved
            bodyClassName="px-6 pb-6 pt-5"
            className="h-full"
          >
            <p className="command-hero-figure text-5xl lg:text-6xl">
              <AnimatedNumber value={overview?.revenueToday ?? 0} format={usd} />
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <ChangeBadge changePercent={overview?.revenueTodayChangePercent ?? null} />
              <span className="text-[var(--cmd-bone-faint)]">against yesterday</span>
            </p>
            <div className="command-rule my-5 opacity-50" />
            <dl className="grid grid-cols-2 gap-4">
              <Readout variant="command" label="Yesterday" size="sm">
                {usd(overview?.revenueYesterday ?? 0)}
              </Readout>
              <Readout
                variant="command"
                label="Awaiting Payment"
                size="sm"
                footnote={`${overview?.pendingPaymentsCount ?? 0} order(s)`}
              >
                {usd(overview?.pendingPaymentsAmount ?? 0)}
              </Readout>
            </dl>
          </Panel>
        </div>

        <div className="command-reveal lg:col-span-7" style={{ ["--reveal-delay" as string]: "110ms" }}>
          <RevenueChart series={overview?.chartSeries ?? []} variant="command" />
        </div>
      </div>

      {/* Ledger strip — five figures across one panel, hairline-ruled between,
          the way a printed statement sets its columns. */}
      <div className="command-reveal" style={{ ["--reveal-delay" as string]: "200ms" }}>
        <Panel variant="command" title="Position" meta="Live" bodyClassName="px-2 py-4">
          <dl className="grid grid-cols-2 divide-y divide-[var(--cmd-brass)]/15 sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-5 lg:divide-x lg:divide-[var(--cmd-brass)]/15">
            {ledger.map((item) => (
              <Readout
                key={item.label}
                variant="command"
                label={item.label}
                size="md"
                className="px-4 py-3"
                footnote={
                  item.change !== undefined ? (
                    <span className="flex items-center gap-1.5">
                      <ChangeBadge changePercent={item.change ?? null} />
                      <span className="text-[var(--cmd-bone-faint)]">vs last month</span>
                    </span>
                  ) : undefined
                }
              >
                <AnimatedNumber value={item.value} format={item.format} />
              </Readout>
            ))}
          </dl>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="command-reveal" style={{ ["--reveal-delay" as string]: "280ms" }}>
          <TopProducts products={overview?.topProducts ?? []} variant="command" />
        </div>
        <div className="command-reveal" style={{ ["--reveal-delay" as string]: "340ms" }}>
          <LowInventory alerts={lowInventory} variant="command" />
        </div>
        <div className="command-reveal" style={{ ["--reveal-delay" as string]: "400ms" }}>
          <ActivityFeed events={overview?.recentActivity ?? []} variant="command" />
        </div>
      </div>
    </div>
  );
}

function OfficeOverview({
  overview,
  lowInventory,
}: {
  overview: ExecutiveOverview | null;
  lowInventory: LowInventoryAlert[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="office"
          label="Revenue — Today"
          value={usd(overview?.revenueToday ?? 0)}
          animate={{ value: overview?.revenueToday ?? 0, format: usd }}
          changePercent={overview?.revenueTodayChangePercent ?? null}
          changeLabel="vs yesterday"
        />
        <StatCard
          variant="office"
          label="Revenue — Month to Date"
          value={usd(overview?.revenueMtd ?? 0)}
          animate={{ value: overview?.revenueMtd ?? 0, format: usd }}
          changePercent={overview?.revenueMtdChangePercent ?? null}
          changeLabel="vs same period last month"
        />
        <StatCard
          variant="office"
          label="Revenue — All Time"
          value={usd(overview?.revenueAllTime ?? 0)}
          animate={{ value: overview?.revenueAllTime ?? 0, format: usd }}
        />
        <StatCard
          variant="office"
          label="Average Order Value"
          value={usd(overview?.averageOrderValue ?? 0)}
          animate={{ value: overview?.averageOrderValue ?? 0, format: usd }}
        />
        <StatCard variant="office" label="Orders Placed" value={String(overview?.orderCount ?? 0)} />
        <StatCard
          variant="office"
          label="Awaiting Payment"
          value={String(overview?.pendingPaymentsCount ?? 0)}
          hint={`${usd0(overview?.pendingPaymentsAmount ?? 0)} outstanding`}
        />
      </div>
      <RevenueChart series={overview?.chartSeries ?? []} variant="office" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopProducts products={overview?.topProducts ?? []} variant="office" />
        <LowInventory alerts={lowInventory} variant="office" />
        <ActivityFeed events={overview?.recentActivity ?? []} variant="office" />
      </div>
    </div>
  );
}
