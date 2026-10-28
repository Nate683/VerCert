import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { updateUser } from "@/lib/users/store";
import { getAffiliateByEmail } from "@/lib/affiliates";
import { REGISTRATION_ACKNOWLEDGMENT } from "@/lib/users/registration";
import { parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  acknowledgment: z.literal(true, {
    error: "Confirm the age and research-use statement to continue.",
  }),
});

// The registration acknowledgment, collected once from an affiliate whose
// account has none (one created before it was asked, or set up from the
// executive dashboard). /partner shows nothing else until it's on record.
export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await getAffiliateByEmail(user.email))) {
    return NextResponse.json({ error: "This account isn't in the partner program." }, { status: 403 });
  }

  const parsed = await parseBody(request, bodySchema);
  if ("error" in parsed) return parsed.error;

  // Already on record: the first acceptance stands, never overwritten.
  if (!user.registrationAckAt) {
    await updateUser(user.id, {
      registrationAckText: REGISTRATION_ACKNOWLEDGMENT,
      registrationAckAt: new Date().toISOString(),
    });
  }
  return NextResponse.json({ ok: true });
});
