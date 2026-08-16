import { query } from "@/lib/db";

const LEADERBOARD_KEY = "leaderboard_enabled";

export async function isLeaderboardEnabled(): Promise<boolean> {
  const rows = await query<{ value: string }>("SELECT value FROM hq_settings WHERE key = $1", [LEADERBOARD_KEY]);
  // Enabled by default until an executive explicitly turns it off.
  return rows[0] ? rows[0].value === "true" : true;
}

export async function setLeaderboardEnabled(enabled: boolean): Promise<void> {
  await query(
    `INSERT INTO hq_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [LEADERBOARD_KEY, String(enabled)]
  );
}
