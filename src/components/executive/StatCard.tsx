type Props = {
  label: string;
  value: string;
  variant: "command" | "office";
  hint?: string;
};

export function StatCard({ label, value, variant, hint }: Props) {
  const isCommand = variant === "command";
  return (
    <div
      className={
        isCommand
          ? "command-card border border-gold/20 bg-white/[0.02] p-6"
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
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-white/30">{hint}</p>}
    </div>
  );
}
