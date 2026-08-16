"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { LiveIndicator } from "./LiveIndicator";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";
import { AnimatedNumber } from "./AnimatedNumber";
import { ChangeBadge } from "./ChangeBadge";

type Variant = "command" | "office";
type Tab =
  | "overview"
  | "orders"
  | "products"
  | "financials"
  | "ledger"
  | "intelligence"
  | "customers"
  | "assistant"
  | "admin"
  | "promotions"
  | "affiliates"
  | "invite-codes"
  | "content"
  | "chat";

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "products", label: "Products" },
  { id: "financials", label: "Financials" },
  { id: "ledger", label: "Ledger" },
  { id: "intelligence", label: "Intelligence" },
  { id: "customers", label: "Customers" },
  { id: "affiliates", label: "Affiliates" },
  { id: "chat", label: "Affiliate Chat" },
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
  { id: "content", label: "Content" },
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
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

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

  // Poll for fresh revenue/order/activity data so the dashboard reflects
  // sales as they happen, without requiring a manual page reload.
  useLiveRefresh(loadOverview);

  useEffect(() => {
    if (!isCommand) return;
    const el = tabRefs.current[tab];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab, isCommand, mounted]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const shellClass = isCommand
    ? `command-grain relative min-h-screen bg-black text-white ${mounted ? "command-fade-in" : "opacity-0"}`
    : "office-shell min-h-screen";

  const headingClass = isCommand
    ? "font-serif text-4xl tracking-tight text-white"
    : "text-2xl font-semibold tracking-tight text-[var(--office-fg)]";

  return (
    <div className={shellClass}>
      {isCommand && <Watermark className="pointer-events-none absolute -top-24 right-0 h-[28rem] w-[28rem]" />}
      <div className={`relative z-10 mx-auto max-w-7xl px-6 lg:px-10 ${isCommand ? "py-12" : "py-14"}`}>
        <div
          className={`flex flex-wrap items-start justify-between gap-6 pb-6 ${
            isCommand ? "border-b border-gold/30" : "border-b border-[var(--office-border)]"
          }`}
        >
          <div>
            <p className={isCommand ? "text-[11px] uppercase tracking-[0.4em] text-gold" : "text-[11px] uppercase tracking-[0.3em] office-gold"}>{terminalName}</p>
            <h1 className={`mt-3 ${headingClass}`}>{executiveName}</h1>
            <p className={isCommand ? "mt-1 font-mono text-xs uppercase tracking-[0.15em] text-white/40" : "mt-1 text-xs text-white/50"}>
              {executiveTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.15em] text-white/70 transition-colors hover:border-gold hover:text-gold"
          >
            Log Out
          </button>
        </div>

        <nav
          className={`relative mt-6 flex gap-2 overflow-x-auto border-b ${isCommand ? "border-gold/15" : "border-[var(--office-border)]"} [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isCommand ? "" : "pb-px"}`}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 whitespace-nowrap ${isCommand ? "border-b-2 border-transparent" : "border-b-2"} px-3 py-2.5 text-xs uppercase tracking-[0.2em] transition-colors duration-300 sm:px-4 ${
                tab === t.id
                  ? isCommand
                    ? "text-gold"
                    : "border-[var(--office-gold)] office-gold"
                  : "text-white/50 hover:text-white " + (isCommand ? "" : "border-transparent")
              }`}
            >
              {t.label}
            </button>
          ))}
          {isCommand && (
            <span
              className="absolute bottom-[-1px] h-[2px] bg-gold transition-all duration-500 ease-out"
              style={{ left: indicator.left, width: indicator.width }}
            />
          )}
        </nav>

        <div className="mt-8">
          {tab === "overview" && (
            <div className="space-y-4">
              <LiveIndicator variant={variant} asOf={overview?.computedAt} />
              {isCommand ? (
                <CommandOverview overview={overview} lowInventory={lowInventory} />
              ) : (
                <div className="space-y-8">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    variant={variant}
                    label="Revenue — Today"
                    value={`$${(overview?.revenueToday ?? 0).toFixed(2)}`}
                    animate={{ value: overview?.revenueToday ?? 0, format: (n) => `$${n.toFixed(2)}` }}
                    changePercent={overview?.revenueTodayChangePercent ?? null}
                    changeLabel="vs yesterday"
                  />
                  <StatCard
                    variant={variant}
                    label="Revenue — MTD"
                    value={`$${(overview?.revenueMtd ?? 0).toFixed(2)}`}
                    animate={{ value: overview?.revenueMtd ?? 0, format: (n) => `$${n.toFixed(2)}` }}
                    changePercent={overview?.revenueMtdChangePercent ?? null}
                    changeLabel="vs same period last month"
                  />
                  <StatCard
                    variant={variant}
                    label="Revenue — All Time"
                    value={`$${(overview?.revenueAllTime ?? 0).toFixed(2)}`}
                    animate={{ value: overview?.revenueAllTime ?? 0, format: (n) => `$${n.toFixed(2)}` }}
                  />
                  <StatCard
                    variant={variant}
                    label="Average Order Value"
                    value={`$${(overview?.averageOrderValue ?? 0).toFixed(2)}`}
                    animate={{ value: overview?.averageOrderValue ?? 0, format: (n) => `$${n.toFixed(2)}` }}
                  />
                  <StatCard variant={variant} label="Total Orders" value={String(overview?.orderCount ?? 0)} />
                  <StatCard
                    variant={variant}
                    label="Pending Payments"
                    value={String(overview?.pendingPaymentsCount ?? 0)}
                    hint={`$${(overview?.pendingPaymentsAmount ?? 0).toFixed(2)} outstanding`}
                  />
                </div>
                <RevenueChart series={overview?.chartSeries ?? []} variant={variant} />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <TopProducts products={overview?.topProducts ?? []} variant={variant} />
                  <LowInventory alerts={lowInventory} variant={variant} />
                  <ActivityFeed events={overview?.recentActivity ?? []} variant={variant} />
                </div>
              </div>
              )}
            </div>
          )}

          {tab === "orders" && <OrderTable variant={variant} />}
          {tab === "products" && <ProductsPanel variant={variant} />}
          {tab === "financials" && <FinancialsPanel variant={variant} />}
          {tab === "ledger" && <LedgerPanel variant={variant} />}
          {tab === "intelligence" && <IntelligencePanel variant={variant} />}
          {tab === "promotions" && isCommand && <PromotionsPanel />}
          {tab === "affiliates" && <AffiliatesPanel variant={variant} />}
          {tab === "invite-codes" && isCommand && <InviteCodesPanel />}
          {tab === "content" && isCommand && <SiteContentPanel />}
          {tab === "customers" && <CustomersPanel variant={variant} />}
          {tab === "chat" &&
            (hqMember ? (
              <ChatPanel member={hqMember} />
            ) : (
              <p className="text-sm text-white/40">Loading affiliate chat…</p>
            ))}
          {tab === "assistant" && <AssistantChat variant={variant} />}
          {tab === "admin" && <AdminPanel variant={variant} />}
        </div>
      </div>
    </div>
  );
}

// The Command-exclusive overview: a denser, hierarchical layout — a hero
// revenue figure, compact secondary stats, and staggered section reveals.
function CommandOverview({
  overview,
  lowInventory,
}: {
  overview: ExecutiveOverview | null;
  lowInventory: LowInventoryAlert[];
}) {
  const secondaryStats: {
    label: string;
    value: number;
    isCurrency: boolean;
    changePercent?: number | null;
    changeLabel?: string;
  }[] = [
    {
      label: "Revenue — MTD",
      value: overview?.revenueMtd ?? 0,
      isCurrency: true,
      changePercent: overview?.revenueMtdChangePercent ?? null,
      changeLabel: "vs last month",
    },
    { label: "Revenue — All Time", value: overview?.revenueAllTime ?? 0, isCurrency: true },
    { label: "Average Order Value", value: overview?.averageOrderValue ?? 0, isCurrency: true },
    { label: "Total Orders", value: overview?.orderCount ?? 0, isCurrency: false },
  ];

  return (
    <div className="space-y-8">
      <div
        className="command-reveal command-panel grid grid-cols-1 gap-8 p-8 lg:grid-cols-[1.3fr_1fr]"
        style={{ ["--reveal-delay" as string]: "0ms" }}
      >
        <div className="border-b border-white/10 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Revenue — Today</p>
          <p className="command-hero-figure mt-4 font-serif text-6xl text-white">
            <AnimatedNumber value={overview?.revenueToday ?? 0} format={(n) => `$${n.toFixed(2)}`} />
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <ChangeBadge changePercent={overview?.revenueTodayChangePercent ?? null} />
            <span className="text-white/30">vs yesterday</span>
          </p>
          <p className="mt-2 text-xs text-white/40">
            {overview?.pendingPaymentsCount ?? 0} payment(s) awaiting confirmation — $
            {(overview?.pendingPaymentsAmount ?? 0).toFixed(2)} outstanding
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6">
          {secondaryStats.map((stat) => (
            <div key={stat.label}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{stat.label}</p>
              <p className="command-hero-figure mt-2 font-mono text-xl text-gold">
                {stat.isCurrency ? (
                  <AnimatedNumber value={stat.value} format={(n) => `$${n.toFixed(2)}`} />
                ) : (
                  <AnimatedNumber value={stat.value} format={(n) => String(Math.round(n))} />
                )}
              </p>
              {stat.changePercent !== undefined && (
                <p className="mt-1 text-[11px]">
                  <ChangeBadge changePercent={stat.changePercent ?? null} />{" "}
                  <span className="text-white/30">{stat.changeLabel}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="command-reveal" style={{ ["--reveal-delay" as string]: "120ms" }}>
        <RevenueChart series={overview?.chartSeries ?? []} variant="command" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="command-reveal" style={{ ["--reveal-delay" as string]: "200ms" }}>
          <TopProducts products={overview?.topProducts ?? []} variant="command" />
        </div>
        <div className="command-reveal" style={{ ["--reveal-delay" as string]: "260ms" }}>
          <LowInventory alerts={lowInventory} variant="command" />
        </div>
        <div className="command-reveal" style={{ ["--reveal-delay" as string]: "320ms" }}>
          <ActivityFeed events={overview?.recentActivity ?? []} variant="command" />
        </div>
      </div>
    </div>
  );
}

