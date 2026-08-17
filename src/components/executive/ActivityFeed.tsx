"use client";

import type { ActivityEvent } from "@/lib/executive/stats";
import { Panel, Empty, type Variant } from "./Chrome";

export function ActivityFeed({
  events,
  variant,
}: {
  events: ActivityEvent[];
  variant: Variant;
}) {
  const isCommand = variant === "command";
  return (
    <Panel
      variant={variant}
      title="Recent Activity"
      meta={events.length > 0 ? `${events.length} entries` : undefined}
      bodyClassName="px-5 pb-5 pt-4"
      className="h-full"
    >
      {events.length === 0 ? (
        <Empty variant={variant}>No activity yet.</Empty>
      ) : (
        <ul className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
          {events.map((event) => (
            <li
              key={event.id}
              className={
                isCommand
                  ? "border-l border-[var(--cmd-brass)]/40 pl-3"
                  : "border-l border-[var(--office-gold)]/50 pl-3"
              }
            >
              <p className={isCommand ? "command-body text-sm" : "text-sm text-[var(--office-fg)]"}>
                {event.message}
              </p>
              <p
                className={
                  isCommand
                    ? "command-figure text-[10px] text-[var(--cmd-bone-faint)]"
                    : "text-[10px] office-platinum"
                }
              >
                {new Date(event.timestamp).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
