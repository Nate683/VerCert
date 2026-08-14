import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/users/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
