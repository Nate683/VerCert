import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { audit, deleteCriteria, deleteLab, saveCriteria, saveLab } from "@/lib/coa/store";

export const dynamic = "force-dynamic";

// Laboratories and acceptance criteria for the certificate system. Executives only.
//   POST { kind: "lab", id?, name, verificationHosts: string[], accreditationNote }
//   POST { kind: "criteria", productSlug, applies, minPurityPercent, quantityMinPercent, quantityMaxPercent, requiredTests }
//   DELETE ?lab=<id>   |   DELETE ?criteria=<slug>

const HOST = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const numOrNull = (v: unknown, lo: number, hi: number): number | null | undefined => {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
};

export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const actor = (await getCurrentCustomer())!.email;
  if (body?.kind === "lab") {
    const name = String(body.name ?? "").replace(/\s+/g, " ").trim();
    if (!name || name.length > 120) return NextResponse.json({ error: "Laboratory name is required (120 characters or fewer)." }, { status: 400 });
    const hosts = (Array.isArray(body.verificationHosts) ? body.verificationHosts : []).map((h) => String(h).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean);
    const bad = hosts.find((h) => !HOST.test(h));
    if (bad) return NextResponse.json({ error: `"${bad}" isn't a valid host name (e.g. verify.examplelab.com).` }, { status: 400 });
    const note = body.accreditationNote ? String(body.accreditationNote).trim().slice(0, 500) || null : null;
    try {
      const lab = await saveLab({ id: typeof body.id === "string" ? body.id : undefined, name, verificationHosts: [...new Set(hosts)], accreditationNote: note }, actor);
      await audit(null, "lab_saved", actor, lab);
      return NextResponse.json({ lab });
    } catch (err) {
      if (/unique|duplicate/i.test(String(err))) return NextResponse.json({ error: "A laboratory with that name already exists." }, { status: 409 });
      throw err;
    }
  }
  if (body?.kind === "criteria") {
    const slug = String(body.productSlug ?? "").trim();
    if (!slug) return NextResponse.json({ error: "Choose the product (or * for the default)." }, { status: 400 });
    const minPurity = numOrNull(body.minPurityPercent, 0, 100);
    const qMin = numOrNull(body.quantityMinPercent, 0, 1000);
    const qMax = numOrNull(body.quantityMaxPercent, 0, 1000);
    if (minPurity === undefined || qMin === undefined || qMax === undefined) return NextResponse.json({ error: "Criteria must be numbers in range." }, { status: 400 });
    if (qMin !== null && qMax !== null && qMin > qMax) return NextResponse.json({ error: "The quantity minimum is above the maximum." }, { status: 400 });
    const required = (Array.isArray(body.requiredTests) ? body.requiredTests : []).map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_")).filter(Boolean).slice(0, 20);
    const criteria = { productSlug: slug, applies: body.applies !== false, minPurityPercent: minPurity, quantityMinPercent: qMin, quantityMaxPercent: qMax, requiredTests: [...new Set(required)] };
    await saveCriteria(criteria, actor);
    await audit(null, "criteria_saved", actor, criteria);
    return NextResponse.json({ criteria });
  }
  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
});

export const DELETE = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const url = new URL(request.url);
  const actor = (await getCurrentCustomer())!.email;
  const lab = url.searchParams.get("lab");
  const criteria = url.searchParams.get("criteria");
  if (lab) {
    if (!(await deleteLab(lab))) return NextResponse.json({ error: "That laboratory is used by certificate records and can't be removed." }, { status: 409 });
    await audit(null, "lab_deleted", actor, { id: lab });
    return NextResponse.json({ ok: true });
  }
  if (criteria) {
    if (criteria === "*") return NextResponse.json({ error: "The default criteria can be edited but not removed." }, { status: 409 });
    await deleteCriteria(criteria);
    await audit(null, "criteria_deleted", actor, { productSlug: criteria });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
});
