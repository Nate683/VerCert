import type { ActivityEvent } from "@/lib/executive/stats";

export function ActivityFeed({
  events,
  variant,
}: {
  events: ActivityEvent[];
  variant: "command" | "office";
}) {
  const isCommand = variant === "command";
  return (
    <div
      className={
        isCommand
          ? "command-card command-panel p-6"
          : "office-card"
      }
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Recent Activity</p>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-white/40">No activity yet.</p>
      ) : (
        <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
          {events.map((event) => (
            <li key={event.id} className="border-l border-gold/30 pl-3 text-sm">
              <p className="text-white/70">{event.message}</p>
              <p className={isCommand ? "font-mono text-[10px] text-white/30" : "text-[10px] text-white/30"}>
                {new Date(event.timestamp).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
