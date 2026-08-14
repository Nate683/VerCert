import { NextResponse } from "next/server";
import { getUserByEmail, createUser, updateUser } from "@/lib/users/store";
import { hashPassword, generateToken } from "@/lib/users/password";
import { isHouseAccountEmail } from "@/lib/executive/house-account";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lightweight email capture — reuses the same Customer record + marketingOptIn
// field as full signup, without requiring a password up front.
export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || isHouseAccountEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    await updateUser(existing.id, { marketingOptIn: true });
  } else {
    const passwordHash = await hashPassword(generateToken());
    await createUser({
      email,
      passwordHash,
      marketingOptIn: true,
      verificationToken: generateToken(),
      verificationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  return NextResponse.json({ ok: true });
}
