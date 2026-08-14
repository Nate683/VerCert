import { cookies } from "next/headers";
import { getExecutiveCookieName, verifyAnyExecutiveSession } from "./auth";

// Shared guard for the /api/executive/* routes — either terminal's session
// grants access to the same underlying data.
export async function requireExecutiveSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAnyExecutiveSession({
    command: cookieStore.get(getExecutiveCookieName("command"))?.value,
    office: cookieStore.get(getExecutiveCookieName("office"))?.value,
  });
}
