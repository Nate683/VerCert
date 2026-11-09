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
  return (
    <Panel
      variant={variant}
      title="Recent Activity"
      meta={events.length > 0 ? `${events.length} entries` : undefined}
      bodyClassName="px-5 pb-3 pt-1"
      className="h-full"
    >
      {events.length === 0 ? (
        <Empty variant={variant}>No activity yet.</Empty>
      ) : (
        <ul className="max-h-72 divide-y divide-[var(--x-border)] overflow-y-auto pr-1">
          {events.map((event) => (
            <li key={event.id} className="py-2.5">
              <p className="text-sm text-[var(--x-text-2)]">{event.message}</p>
              <p className="mt-0.5 text-[11px] tabular-nums text-[var(--x-faint)]">
                {new Date(event.timestamp).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
