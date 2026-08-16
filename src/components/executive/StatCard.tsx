import { AnimatedNumber } from "./AnimatedNumber";
import { ChangeBadge } from "./ChangeBadge";

type Props = {
  label: string;
  value: string;
  variant: "command" | "office";
  hint?: string;
  changePercent?: number | null;
  changeLabel?: string;
  animate?: { value: number; format: (n: number) => string };
};

export function StatCard({ label, value, variant, hint, changePercent, changeLabel, animate }: Props) {
  const isCommand = variant === "command";
  return (
    <div
      className={
        isCommand
          ? "command-card command-panel p-6"
          : "office-card"
      }
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p
        className={
          isCommand
            ? "command-hero-figure mt-3 font-mono text-3xl text-gold"
            : "mt-2 text-2xl font-semibold office-gold"
        }
      >
        {animate ? <AnimatedNumber value={animate.value} format={animate.format} /> : value}
      </p>
      {changePercent !== undefined && (
        <p className="mt-1 text-xs">
          <ChangeBadge changePercent={changePercent} />{" "}
          <span className="text-white/30">{changeLabel ?? "vs prior period"}</span>
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-white/30">{hint}</p>}
    </div>
  );
}
