import { NextResponse } from "next/server";
import { getUserByVerificationToken, updateUser } from "@/lib/users/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token");

  const redirect = (status: string) =>
    NextResponse.redirect(`${origin}/verify-email?status=${status}`);

  if (!token) return redirect("invalid");

  const user = await getUserByVerificationToken(token);
  if (
    !user ||
    !user.verificationTokenExpiresAt ||
    new Date(user.verificationTokenExpiresAt).getTime() < Date.now()
  ) {
    return redirect("invalid");
  }

  await updateUser(user.id, {
    emailVerified: true,
    verificationToken: undefined,
    verificationTokenExpiresAt: undefined,
  });

  return redirect("success");
}
