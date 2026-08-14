import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { updateUser } from "@/lib/users/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { marketingOptIn?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  await updateUser(user.id, { marketingOptIn: Boolean(body.marketingOptIn) });
  return NextResponse.json({ ok: true });
}
