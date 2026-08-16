import { listStaffUsers, getUserByEmail } from "@/lib/users/store";
import { listAffiliates } from "@/lib/affiliates";
import { EXECUTIVE_IDENTITY } from "@/lib/executive/identity";
import type { HqMember } from "./require-hq";

// Full /hq roster — executives (either realm) plus active affiliates —
// keyed by their underlying customer id, used for the directory, starting
// new DMs, and resolving a sender/participant id to a display name.
export async function listHqMembers(): Promise<HqMember[]> {
  const staff = await listStaffUsers();
  const executiveMembers: HqMember[] = staff
    .filter((u): u is typeof u & { role: "command" | "office" } => u.role === "command" || u.role === "office")
    .map((u) => ({ id: u.id, name: EXECUTIVE_IDENTITY[u.role].name, kind: "executive" as const }));

  const affiliates = (await listAffiliates()).filter((a) => a.active);
  const affiliateMembers: HqMember[] = [];
  for (const affiliate of affiliates) {
    const user = await getUserByEmail(affiliate.email);
    if (user) {
      affiliateMembers.push({ id: user.id, name: affiliate.name, kind: "affiliate", tier: affiliate.tier });
    }
  }

  return [...executiveMembers, ...affiliateMembers];
}

// Deterministic DM thread id — same string regardless of who starts it.
export function dmChannelId(idA: string, idB: string): string {
  const [a, b] = [idA, idB].sort();
  return `dm:${a}:${b}`;
}

export function parseDmChannel(channel: string): [string, string] | null {
  if (!channel.startsWith("dm:")) return null;
  const rest = channel.slice(3);
  const idx = rest.indexOf(":");
  if (idx === -1) return null;
  return [rest.slice(0, idx), rest.slice(idx + 1)];
}
