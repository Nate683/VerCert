import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      marketingOptIn: user.marketingOptIn,
      emailVerified: user.emailVerified,
    },
  });
}
