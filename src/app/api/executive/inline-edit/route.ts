import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import {
  getContent,
  setContent,
  DEFAULT_HOME_HERO,
  DEFAULT_FEATURED,
  DEFAULT_HOME_SECTIONS,
  DEFAULT_ABOUT,
  DEFAULT_CONTACT,
  DEFAULT_FAQ,
} from "@/lib/site-content";
import { inlineEditSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

// Backs Live Edit Mode's click-to-edit fields — a narrower, both-realm
// merge-patch on top of the same site_content keys the /command Content tab
// manages in full. Only whitelisted keys are patchable here; the dedicated
// Content tab (src/app/api/executive/content) remains /command-only for
// full section management.
// Each key's real default — NOT `{}` — so a partial patch never wipes out
// fields that haven't been individually edited yet (e.g. editing just the
// contact email shouldn't blank out phone/address/hours).
const DEFAULTS: Record<string, unknown> = {
  home_hero: DEFAULT_HOME_HERO,
  featured_products: DEFAULT_FEATURED,
  home_sections: DEFAULT_HOME_SECTIONS,
  about_page: DEFAULT_ABOUT,
  contact_page: DEFAULT_CONTACT,
  faq_items: DEFAULT_FAQ,
};

export const POST = withApiErrorHandling(async (request: Request) => {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, inlineEditSchema);
  if ("error" in parsed) return parsed.error;
  const { key, patch } = parsed.data;

  if (!DEFAULTS[key]) {
    return NextResponse.json({ error: "This field can't be edited inline." }, { status: 400 });
  }

  const current = await getContent<Record<string, unknown>>(key, DEFAULTS[key] as Record<string, unknown>);
  const merged = Array.isArray(current) || Array.isArray(patch) ? patch : { ...current, ...patch };
  await setContent(key, merged);

  await logActivity(actor.email, "inline_edit", `${key}: ${Object.keys(patch).join(", ")}`);

  return NextResponse.json({ ok: true, value: merged });
});
