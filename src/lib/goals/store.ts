import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import type { GoalPeriodType, RevenueGoal } from "@/lib/types";

type GoalRow = {
  id: string;
  period: string;
  period_type: GoalPeriodType;
  target_usd: number;
  created_at: string;
  updated_at: string;
};

function rowToGoal(row: GoalRow): RevenueGoal {
  return {
    id: row.id,
    period: row.period,
    periodType: row.period_type,
    targetUsd: row.target_usd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listGoals(): Promise<RevenueGoal[]> {
  const rows = await query<GoalRow>("SELECT * FROM revenue_goals ORDER BY period DESC");
  return rows.map(rowToGoal);
}

export async function upsertGoal(input: {
  period: string;
  periodType: GoalPeriodType;
  targetUsd: number;
}): Promise<RevenueGoal> {
  const now = new Date().toISOString();
  const existing = await query<GoalRow>("SELECT * FROM revenue_goals WHERE period = $1", [input.period]);
  if (existing.length > 0) {
    const rows = await query<GoalRow>(
      "UPDATE revenue_goals SET target_usd = $1, period_type = $2, updated_at = $3 WHERE period = $4 RETURNING *",
      [input.targetUsd, input.periodType, now, input.period]
    );
    return rowToGoal(rows[0]);
  }
  const id = randomUUID();
  await query(
    `INSERT INTO revenue_goals (id, period, period_type, target_usd, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.period, input.periodType, input.targetUsd, now, now]
  );
  return { id, period: input.period, periodType: input.periodType, targetUsd: input.targetUsd, createdAt: now, updatedAt: now };
}

export async function deleteGoal(id: string): Promise<void> {
  await query("DELETE FROM revenue_goals WHERE id = $1", [id]);
}
