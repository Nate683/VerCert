"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AboutContent,
  ContactContent,
  FaqItem,
  FeaturedContent,
  HomeHeroContent,
  PoliciesContent,
} from "@/lib/site-content";

type ProductOption = { slug: string; name: string };

const SECTION_CARD = "border border-gold/20 bg-white/[0.02] p-6";

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="mt-4 border border-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
    >
      {saving ? "Saving..." : "Save"}
    </button>
  );
}

// /command-only tab: homepage hero, featured products, About/FAQ/Contact
// copy, and legal policy pages. Every section saves independently.
export function SiteContentPanel() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [uploadingHero, setUploadingHero] = useState(false);

  const [hero, setHero] = useState<HomeHeroContent | null>(null);
  const [featured, setFeatured] = useState<FeaturedContent | null>(null);
  const [about, setAbout] = useState<AboutContent | null>(null);
  const [faq, setFaq] = useState<FaqItem[] | null>(null);
  const [contact, setContact] = useState<ContactContent | null>(null);
  const [policies, setPolicies] = useState<PoliciesContent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [contentRes, productsRes] = await Promise.all([
      fetch("/api/executive/content", { cache: "no-store" }),
      fetch("/api/executive/products", { cache: "no-store" }),
    ]);
    if (contentRes.ok) {
      const data = await contentRes.json();
      setHero(data.homeHero);
      setFeatured(data.featuredProducts);
      setAbout(data.aboutPage);
      setFaq(data.faqItems);
      setContact(data.contactPage);
      setPolicies(data.policies);
    }
    if (productsRes.ok) {
      const data = await productsRes.json();
      setProducts(data.products ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  async function save(key: string, value: unknown) {
    setSavingKey(key);
    setSavedKey(null);
    try {
      await fetch("/api/executive/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      setSavedKey(key);
    } finally {
      setSavingKey(null);
    }
  }

  async function handleHeroImageUpload(file: File) {
    setUploadingHero(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/executive/content/upload-image", { method: "POST", body });
      const data = await res.json();
      if (res.ok && hero) setHero({ ...hero, heroImageUrl: data.url });
    } finally {
      setUploadingHero(false);
    }
  }

  if (loading || !hero || !featured || !about || !faq || !contact || !policies) {
    return <p className="text-sm text-white/30">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Homepage Hero */}
      <div className={SECTION_CARD}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Homepage Hero</p>
        <div className="mt-4 grid grid-cols-1 gap-3">
          <input
            value={hero.badge}
            onChange={(e) => setHero({ ...hero, badge: e.target.value })}
            placeholder="Badge (small text above headline)"
            className="input-field"
          />
          <textarea
            value={hero.headline}
            onChange={(e) => setHero({ ...hero, headline: e.target.value })}
            placeholder="Headline — use a line break where you want the text to wrap"
            rows={2}
            className="input-field"
          />
          <textarea
            value={hero.subtext}
            onChange={(e) => setHero({ ...hero, subtext: e.target.value })}
            placeholder="Subtext"
            rows={3}
            className="input-field"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={hero.ctaPrimaryLabel}
              onChange={(e) => setHero({ ...hero, ctaPrimaryLabel: e.target.value })}
              placeholder="Primary button label"
              className="input-field"
            />
            <input
              value={hero.ctaSecondaryLabel}
              onChange={(e) => setHero({ ...hero, ctaSecondaryLabel: e.target.value })}
              placeholder="Secondary button label"
              className="input-field"
            />
          </div>
          <div className="flex items-center gap-3">
            {hero.heroImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- small admin preview thumbnail, not worth next/image config here
              <img src={hero.heroImageUrl} alt="" className="h-16 w-28 border border-white/10 object-cover" />
            )}
            <label className="cursor-pointer border border-white/20 px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold">
              {uploadingHero ? "Uploading..." : hero.heroImageUrl ? "Replace Image" : "Upload Image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleHeroImageUpload(file);
                }}
              />
            </label>
            {hero.heroImageUrl && (
              <button
                type="button"
                onClick={() => setHero({ ...hero, heroImageUrl: undefined })}
                className="text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:text-red-300"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <SaveButton saving={savingKey === "home_hero"} onClick={() => save("home_hero", hero)} />
        {savedKey === "home_hero" && <span className="ml-3 text-xs text-gold">Saved.</span>}
      </div>

      {/* Featured products */}
      <div className={SECTION_CARD}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Featured Products (Homepage)</p>
        <p className="mt-1 text-[10px] text-white/30">
          Leave none selected to automatically show the first 4 catalog products.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {products.map((p) => (
            <button
              key={p.slug}
              type="button"
              onClick={() =>
                setFeatured({
                  slugs: featured.slugs.includes(p.slug)
                    ? featured.slugs.filter((s) => s !== p.slug)
                    : [...featured.slugs, p.slug],
                })
              }
              className={`border px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] ${
                featured.slugs.includes(p.slug)
                  ? "border-gold text-gold"
                  : "border-white/20 text-white/50 hover:border-white/40"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <SaveButton saving={savingKey === "featured_products"} onClick={() => save("featured_products", featured)} />
        {savedKey === "featured_products" && <span className="ml-3 text-xs text-gold">Saved.</span>}
      </div>

      {/* About page */}
      <div className={SECTION_CARD}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">About Page</p>
        <div className="mt-4 grid grid-cols-1 gap-3">
          <input
            value={about.badge}
            onChange={(e) => setAbout({ ...about, badge: e.target.value })}
            placeholder="Badge"
            className="input-field"
          />
          <input
            value={about.headline}
            onChange={(e) => setAbout({ ...about, headline: e.target.value })}
            placeholder="Headline"
            className="input-field"
          />
          <textarea
            value={about.intro}
            onChange={(e) => setAbout({ ...about, intro: e.target.value })}
            placeholder="Intro paragraph"
            rows={3}
            className="input-field"
          />
          {about.pillars.map((pillar, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 border border-white/10 p-3 sm:grid-cols-2">
              <input
                value={pillar.title}
                onChange={(e) => {
                  const pillars = about.pillars.map((p, j) => (j === i ? { ...p, title: e.target.value } : p));
                  setAbout({ ...about, pillars });
                }}
                placeholder={`Pillar ${i + 1} title`}
                className="input-field"
              />
              <input
                value={pillar.body}
                onChange={(e) => {
                  const pillars = about.pillars.map((p, j) => (j === i ? { ...p, body: e.target.value } : p));
                  setAbout({ ...about, pillars });
                }}
                placeholder={`Pillar ${i + 1} body`}
                className="input-field"
              />
            </div>
          ))}
          <input
            value={about.standardHeading}
            onChange={(e) => setAbout({ ...about, standardHeading: e.target.value })}
            placeholder="Standard section heading"
            className="input-field"
          />
          <textarea
            value={about.standardParagraphs.join("\n\n")}
            onChange={(e) =>
              setAbout({ ...about, standardParagraphs: e.target.value.split("\n\n").filter((p) => p.trim()) })
            }
            placeholder="Standard section paragraphs — separate paragraphs with a blank line"
            rows={6}
            className="input-field"
          />
        </div>
        <SaveButton saving={savingKey === "about_page"} onClick={() => save("about_page", about)} />
        {savedKey === "about_page" && <span className="ml-3 text-xs text-gold">Saved.</span>}
      </div>

      {/* FAQ */}
      <div className={SECTION_CARD}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">FAQ</p>
        <div className="mt-4 space-y-3">
          {faq.map((item, i) => (
            <div key={i} className="border border-white/10 p-3">
              <input
                value={item.q}
                onChange={(e) => setFaq(faq.map((f, j) => (j === i ? { ...f, q: e.target.value } : f)))}
                placeholder="Question"
                className="input-field"
              />
              <textarea
                value={item.a}
                onChange={(e) => setFaq(faq.map((f, j) => (j === i ? { ...f, a: e.target.value } : f)))}
                placeholder="Answer"
                rows={2}
                className="input-field mt-2"
              />
              <button
                type="button"
                onClick={() => setFaq(faq.filter((_, j) => j !== i))}
                className="mt-2 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:text-red-300"
              >
                Remove Question
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setFaq([...faq, { q: "", a: "" }])}
            className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold"
          >
            + Add Question
          </button>
        </div>
        <SaveButton saving={savingKey === "faq_items"} onClick={() => save("faq_items", faq)} />
        {savedKey === "faq_items" && <span className="ml-3 text-xs text-gold">Saved.</span>}
      </div>

      {/* Contact */}
      <div className={SECTION_CARD}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Contact Page</p>
        <div className="mt-4 grid grid-cols-1 gap-3">
          <textarea
            value={contact.intro}
            onChange={(e) => setContact({ ...contact, intro: e.target.value })}
            placeholder="Intro"
            rows={2}
            className="input-field"
          />
          <input
            value={contact.email}
            onChange={(e) => setContact({ ...contact, email: e.target.value })}
            placeholder="Contact email"
            className="input-field"
          />
          <input
            value={contact.phone}
            onChange={(e) => setContact({ ...contact, phone: e.target.value })}
            placeholder="Contact phone"
            className="input-field"
          />
          <input
            value={contact.address}
            onChange={(e) => setContact({ ...contact, address: e.target.value })}
            placeholder="Business address"
            className="input-field"
          />
          <input
            value={contact.hours}
            onChange={(e) => setContact({ ...contact, hours: e.target.value })}
            placeholder="Hours"
            className="input-field"
          />
          <textarea
            value={contact.wholesaleNote}
            onChange={(e) => setContact({ ...contact, wholesaleNote: e.target.value })}
            placeholder="Wholesale note"
            rows={2}
            className="input-field"
          />
        </div>
        <SaveButton saving={savingKey === "contact_page"} onClick={() => save("contact_page", contact)} />
        {savedKey === "contact_page" && <span className="ml-3 text-xs text-gold">Saved.</span>}
      </div>

      {/* Policies */}
      <div className={SECTION_CARD}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Legal Policy Pages</p>
        <p className="mt-1 text-[10px] text-white/30">
          Starter text only — have these reviewed by counsel before relying on them.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4">
          {(
            [
              ["privacy", "Privacy Policy"],
              ["terms", "Terms of Service"],
              ["refund", "Refund Policy"],
              ["shipping", "Shipping Policy"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">{label}</span>
              <textarea
                value={policies[key].join("\n\n")}
                onChange={(e) =>
                  setPolicies({ ...policies, [key]: e.target.value.split("\n\n").filter((p) => p.trim()) })
                }
                rows={4}
                className="input-field mt-1"
                placeholder="Separate paragraphs with a blank line"
              />
            </label>
          ))}
        </div>
        <SaveButton saving={savingKey === "policies"} onClick={() => save("policies", policies)} />
        {savedKey === "policies" && <span className="ml-3 text-xs text-gold">Saved.</span>}
      </div>
    </div>
  );
}
