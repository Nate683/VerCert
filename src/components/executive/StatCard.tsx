import { AnimatedNumber } from "./AnimatedNumber";
import { ChangeBadge } from "./ChangeBadge";
import { Panel, Readout, type Variant } from "./Chrome";

type Props = {
  label: string;
  value: string;
  variant: Variant;
  hint?: string;
  changePercent?: number | null;
  changeLabel?: string;
  animate?: { value: number; format: (n: number) => string };
};

export function StatCard({ label, value, variant, hint, changePercent, changeLabel, animate }: Props) {
  const figure = animate ? <AnimatedNumber value={animate.value} format={animate.format} /> : value;
  const footnote = (
    <>
      {changePercent !== undefined && (
        <span className="flex items-center gap-1.5">
          <ChangeBadge changePercent={changePercent ?? null} />
          <span>{changeLabel ?? "vs prior period"}</span>
        </span>
      )}
      {hint && <span className="block">{hint}</span>}
    </>
  );

  if (variant === "office") {
    return (
      <div className="office-card">
        <Readout
          variant="office"
          label={label}
          size="lg"
          footnote={changePercent !== undefined || hint ? footnote : undefined}
        >
          {figure}
        </Readout>
      </div>
    );
  }

  return (
    <Panel variant="command" title={label} bodyClassName="px-5 pb-5 pt-4">
      <p className="command-figure text-2xl">{figure}</p>
      {(changePercent !== undefined || hint) && (
        <div className="mt-1.5 space-y-0.5 text-[11px] text-[var(--cmd-bone-dim)]">{footnote}</div>
      )}
    </Panel>
  );
}
