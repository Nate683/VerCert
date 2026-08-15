import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { getContent, setContent } from "@/lib/site-content";
import {
  DEFAULT_HOME_HERO,
  DEFAULT_FEATURED,
  DEFAULT_ABOUT,
  DEFAULT_FAQ,
  DEFAULT_CONTACT,
  DEFAULT_POLICIES,
  DEFAULT_SALE_BANNER,
} from "@/lib/site-content";
import { siteContentUpdateSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Site content editing is /command-only — /office never sees or can call this.
export const GET = withApiErrorHandling(async () => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const [homeHero, featuredProducts, aboutPage, faqItems, contactPage, policies, saleBanner] =
    await Promise.all([
      getContent("home_hero", DEFAULT_HOME_HERO),
      getContent("featured_products", DEFAULT_FEATURED),
      getContent("about_page", DEFAULT_ABOUT),
      getContent("faq_items", DEFAULT_FAQ),
      getContent("contact_page", DEFAULT_CONTACT),
      getContent("policies", DEFAULT_POLICIES),
      getContent("sale_banner", DEFAULT_SALE_BANNER),
    ]);

  return NextResponse.json({
    homeHero,
    featuredProducts,
    aboutPage,
    faqItems,
    contactPage,
    policies,
    saleBanner,
  });
});

export const PATCH = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, siteContentUpdateSchema);
  if ("error" in parsed) return parsed.error;

  await setContent(parsed.data.key, parsed.data.value);
  return NextResponse.json({ ok: true });
});
