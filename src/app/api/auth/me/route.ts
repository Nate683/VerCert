import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      marketingOptIn: user.marketingOptIn,
      emailVerified: user.emailVerified,
      role: user.role ?? null,
    },
  });
});
