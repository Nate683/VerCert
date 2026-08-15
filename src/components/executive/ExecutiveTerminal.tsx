"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExecutiveOverview } from "@/lib/executive/stats";
import type { LowInventoryAlert } from "@/lib/inventory";
import { StatCard } from "./StatCard";
import { RevenueChart } from "./RevenueChart";
import { TopProducts } from "./TopProducts";
import { LowInventory } from "./LowInventory";
import { ActivityFeed } from "./ActivityFeed";
import { OrderTable } from "./OrderTable";
import { CustomersPanel } from "./CustomersPanel";
import { AssistantChat } from "./AssistantChat";
import { ProductsPanel } from "./ProductsPanel";

type Variant = "command" | "office";
type Tab = "overview" | "orders" | "products" | "customers" | "assistant";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "products", label: "Products" },
  { id: "customers", label: "Customers" },
  { id: "assistant", label: "Assistant" },
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
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
  const [lowInventory, setLowInventory] = useState<LowInventoryAlert[]>([]);
  const [mounted, setMounted] = useState(false);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fade-in trigger + mount-time fetch
    setMounted(true);
    fetch("/api/executive/overview", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setOverview(data.overview ?? null);
        setLowInventory(data.lowInventory ?? []);
      });
  }, []);

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
    ? `command-grain min-h-screen bg-black text-white ${mounted ? "command-fade-in" : "opacity-0"}`
    : "min-h-screen bg-black text-white";

  const headingClass = isCommand
    ? "font-serif text-3xl tracking-tight text-white"
    : "text-xl font-semibold text-white";

  return (
    <div className={shellClass}>
      <div className={`relative z-10 mx-auto max-w-7xl px-6 lg:px-10 ${isCommand ? "py-12" : "py-10"}`}>
        <div
          className={`flex flex-wrap items-start justify-between gap-6 pb-6 ${
            isCommand ? "border-b border-gold/25" : "border-b border-gold/20"
          }`}
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-gold">{terminalName}</p>
            <h1 className={`mt-3 ${headingClass}`}>{executiveName}</h1>
            <p className={isCommand ? "mt-1 text-xs uppercase tracking-[0.15em] text-white/40" : "mt-1 text-xs text-white/40"}>
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

        <nav className={`relative mt-6 flex gap-2 border-b border-white/10 ${isCommand ? "" : "pb-px"}`}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              onClick={() => setTab(t.id)}
              className={`${isCommand ? "border-b-2 border-transparent" : "border-b-2"} px-4 py-2.5 text-xs uppercase tracking-[0.2em] transition-colors duration-300 ${
                tab === t.id
                  ? isCommand
                    ? "text-gold"
                    : "border-gold text-gold"
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
          {tab === "overview" &&
            (isCommand ? (
              <CommandOverview overview={overview} lowInventory={lowInventory} />
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard variant={variant} label="Revenue — Today" value={`$${(overview?.revenueToday ?? 0).toFixed(2)}`} />
                  <StatCard variant={variant} label="Revenue — MTD" value={`$${(overview?.revenueMtd ?? 0).toFixed(2)}`} />
                  <StatCard variant={variant} label="Revenue — All Time" value={`$${(overview?.revenueAllTime ?? 0).toFixed(2)}`} />
                  <StatCard variant={variant} label="Average Order Value" value={`$${(overview?.averageOrderValue ?? 0).toFixed(2)}`} />
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
            ))}

          {tab === "orders" && <OrderTable variant={variant} />}
          {tab === "products" && <ProductsPanel variant={variant} />}
          {tab === "customers" && <CustomersPanel variant={variant} />}
          {tab === "assistant" && <AssistantChat variant={variant} />}
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
  const secondaryStats = [
    { label: "Revenue — MTD", value: `$${(overview?.revenueMtd ?? 0).toFixed(2)}` },
    { label: "Revenue — All Time", value: `$${(overview?.revenueAllTime ?? 0).toFixed(2)}` },
    { label: "Average Order Value", value: `$${(overview?.averageOrderValue ?? 0).toFixed(2)}` },
    { label: "Total Orders", value: String(overview?.orderCount ?? 0) },
  ];

  return (
    <div className="space-y-8">
      <div
        className="command-reveal command-card grid grid-cols-1 gap-8 border border-gold/25 bg-white/[0.02] p-8 lg:grid-cols-[1.3fr_1fr]"
        style={{ ["--reveal-delay" as string]: "0ms" }}
      >
        <div className="border-b border-white/10 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Revenue — Today</p>
          <p className="command-hero-figure mt-4 font-serif text-6xl text-white">
            ${(overview?.revenueToday ?? 0).toFixed(2)}
          </p>
          <p className="mt-3 text-xs text-white/40">
            {overview?.pendingPaymentsCount ?? 0} payment(s) awaiting confirmation — $
            {(overview?.pendingPaymentsAmount ?? 0).toFixed(2)} outstanding
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6">
          {secondaryStats.map((stat) => (
            <div key={stat.label}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{stat.label}</p>
              <p className="command-hero-figure mt-2 font-mono text-xl text-gold">{stat.value}</p>
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

