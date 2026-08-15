import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { getContent, setContent } from "@/lib/site-content";
import { inlineEditSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

// Backs Live Edit Mode's click-to-edit fields — a narrower, both-realm
// merge-patch on top of the same site_content keys the /command Content tab
// manages in full. Only whitelisted keys are patchable here; the dedicated
// Content tab (src/app/api/executive/content) remains /command-only for
// full section management.
const ALLOWED_KEYS = new Set([
  "home_hero",
  "featured_products",
  "home_sections",
  "about_page",
  "contact_page",
  "faq_items",
]);

export const POST = withApiErrorHandling(async (request: Request) => {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, inlineEditSchema);
  if ("error" in parsed) return parsed.error;
  const { key, patch } = parsed.data;

  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "This field can't be edited inline." }, { status: 400 });
  }

  const current = await getContent<Record<string, unknown>>(key, {});
  const merged = Array.isArray(current) || Array.isArray(patch) ? patch : { ...current, ...patch };
  await setContent(key, merged);

  await logActivity(actor.email, "inline_edit", `${key}: ${Object.keys(patch).join(", ")}`);

  return NextResponse.json({ ok: true, value: merged });
});
