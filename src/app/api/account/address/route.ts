import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { updateUser } from "@/lib/users/store";
import type { SavedAddress } from "@/lib/types";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const REQUIRED_FIELDS: (keyof SavedAddress)[] = ["address", "city", "state", "postalCode", "country"];

export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Partial<SavedAddress>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  for (const field of REQUIRED_FIELDS) {
    if (!body[field] || typeof body[field] !== "string" || !body[field]!.trim()) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  const savedAddress: SavedAddress = {
    address: body.address!.trim().slice(0, 200),
    city: body.city!.trim().slice(0, 100),
    state: body.state!.trim().slice(0, 100),
    postalCode: body.postalCode!.trim().slice(0, 20),
    country: body.country!.trim().slice(0, 100),
  };

  await updateUser(user.id, { savedAddress });
  return NextResponse.json({ ok: true, savedAddress });
});
