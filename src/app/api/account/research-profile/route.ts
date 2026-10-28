import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { updateUser } from "@/lib/users/store";
import { researchProfileGaps } from "@/lib/users/research-profile";
import { REGISTRATION_ACKNOWLEDGMENT, RESEARCH_CATEGORIES, normalizePhone } from "@/lib/users/registration";
import { parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const bodySchema = z.union([
  z.object({ skip: z.literal(true) }),
  z.object({
    researchCategory: z.enum(RESEARCH_CATEGORIES).optional(),
    phone: z.string().max(30).optional(),
    acknowledgment: z.boolean().optional(),
  }),
]);

// The one-time prompt for older customer accounts. Answering or skipping both
// mark it resolved, so it never comes back; an answer must fill every detail
// the account was missing, with the same rules as registration.
export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const gaps = await researchProfileGaps(user);
  if (!gaps) return NextResponse.json({ error: "There's nothing to add to this account." }, { status: 409 });

  const parsed = await parseBody(request, bodySchema);
  if ("error" in parsed) return parsed.error;
  const now = new Date().toISOString();

  if ("skip" in parsed.data) {
    await updateUser(user.id, { researchPromptResolvedAt: now });
    return NextResponse.json({ ok: true });
  }

  const { researchCategory, phone, acknowledgment } = parsed.data;
  if (gaps.category && !researchCategory) {
    return NextResponse.json({ error: "Select your research category." }, { status: 400 });
  }
  const normalizedPhone = gaps.phone ? normalizePhone(phone ?? "") : null;
  if (gaps.phone && !normalizedPhone) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }
  if (gaps.acknowledgment && acknowledgment !== true) {
    return NextResponse.json(
      { error: "Confirm the age and research-use statement to save." },
      { status: 400 }
    );
  }

  // Only what was missing is written; nothing already on the account changes.
  await updateUser(user.id, {
    ...(gaps.category ? { researchCategory } : {}),
    // Contact only: smsOptIn is untouched, so no text is ever sent to it.
    ...(gaps.phone ? { phone: normalizedPhone! } : {}),
    ...(gaps.acknowledgment ? { registrationAckText: REGISTRATION_ACKNOWLEDGMENT, registrationAckAt: now } : {}),
    researchPromptResolvedAt: now,
  });
  return NextResponse.json({ ok: true });
});
