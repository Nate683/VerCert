import { NextResponse } from "next/server";
import { getUserByEmail, getUserByPendingEmailToken, updateUser } from "@/lib/users/store";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async (request: Request) => {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token");

  const redirect = (status: string) =>
    NextResponse.redirect(`${origin}/verify-email-change?status=${status}`);

  if (!token) return redirect("invalid");

  const user = await getUserByPendingEmailToken(token);
  if (
    !user ||
    !user.pendingEmail ||
    !user.pendingEmailTokenExpiresAt ||
    new Date(user.pendingEmailTokenExpiresAt).getTime() < Date.now()
  ) {
    return redirect("invalid");
  }

  // Someone else may have claimed this address while the link was pending.
  const conflict = await getUserByEmail(user.pendingEmail);
  if (conflict && conflict.id !== user.id) return redirect("conflict");

  await updateUser(user.id, {
    email: user.pendingEmail,
    emailVerified: true,
    pendingEmail: undefined,
    pendingEmailToken: undefined,
    pendingEmailTokenExpiresAt: undefined,
  });

  return redirect("success");
});
