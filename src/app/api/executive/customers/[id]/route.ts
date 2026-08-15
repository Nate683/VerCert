import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getUserById, updateUser } from "@/lib/users/store";
import { customerNotesSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  if (!(await getUserById(id))) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const parsed = await parseBody(request, customerNotesSchema);
  if ("error" in parsed) return parsed.error;

  const customer = await updateUser(id, { notes: parsed.data.notes });
  return NextResponse.json({ customer: customer ? { id: customer.id, notes: customer.notes } : null });
});
