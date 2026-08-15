// Default/fallback copy for every editable site-content key — this is what
// renders until the CEO edits something from the /command Content tab, so
// the storefront looks identical to today even with an empty site_content
// table (e.g. right after `db:migrate` on a fresh database).

export type HomeHeroContent = {
  badge: string;
  headline: string; // "\n" renders as a line break
  subtext: string;
  ctaPrimaryLabel: string;
  ctaSecondaryLabel: string;
  heroImageUrl?: string;
};

export const DEFAULT_HOME_HERO: HomeHeroContent = {
  badge: "Research Use Only",
  headline: "Research Peptides,\nVerified to the Batch.",
  subtext:
    "VeriCert supplies high-purity synthetic peptides and reference compounds for laboratory research, each accompanied by an independent certificate of analysis.",
  ctaPrimaryLabel: "Shop the Collection",
  ctaSecondaryLabel: "Verify a COA",
};

export type FeaturedContent = { slugs: string[] }; // empty = auto (first 4 by sort order)
export const DEFAULT_FEATURED: FeaturedContent = { slugs: [] };

export type AboutPillar = { title: string; body: string };

export type AboutContent = {
  badge: string;
  headline: string;
  intro: string;
  pillars: AboutPillar[];
  standardHeading: string;
  standardParagraphs: string[];
};

export const DEFAULT_ABOUT: AboutContent = {
  badge: "About VeriCert",
  headline: "Built for the Bench, Not the Bottle",
  intro:
    "VeriCert exists to give researchers a dependable source of synthetic peptides and reference compounds — supplied with the documentation and analytical rigor that laboratory work demands.",
  pillars: [
    {
      title: "Sourced with Rigor",
      body: "We work with synthesis partners who follow documented quality processes for every production lot.",
    },
    {
      title: "Tested Independently",
      body: "No batch ships without third-party laboratory analysis confirming identity and purity.",
    },
    {
      title: "Transparent by Default",
      body: "Certificates of analysis are available for every batch number, not just on request.",
    },
  ],
  standardHeading: "Our Standard",
  standardParagraphs: [
    "Every compound in the VeriCert catalog is manufactured under controlled conditions and analyzed by an accredited third-party laboratory before release. Analytical methods include reverse-phase HPLC for purity quantification and mass spectrometry for identity confirmation.",
    "We publish a full certificate of analysis for each batch, searchable by batch number, so any researcher can verify what they have received against an independent lab report.",
    "VeriCert products are supplied strictly for laboratory research use. They are not drugs, foods, dietary supplements, or cosmetics, and are not intended for human or veterinary use.",
  ],
};

export type FaqItem = { q: string; a: string };

export const DEFAULT_FAQ: FaqItem[] = [
  {
    q: "What is VeriCert's intended use for these products?",
    a: "All VeriCert products are intended strictly for in-vitro laboratory research and analytical use by qualified professionals. They are not drugs, foods, dietary supplements, or cosmetics, and are not intended for human or veterinary consumption.",
  },
  {
    q: "How is purity determined and reported?",
    a: "Purity is quantified by reverse-phase HPLC and reported as an area percentage against a certified reference standard. Identity is separately confirmed using mass spectrometry.",
  },
  {
    q: "Where do I find the batch number for my order?",
    a: "The batch number is printed on the vial label and included on your packing slip. Enter it on the COA Verification page to view the independent lab report for that specific lot.",
  },
  {
    q: "Who performs your testing?",
    a: "Testing is conducted by accredited third-party analytical laboratories that have no ownership or affiliation with VeriCert, ensuring the results are independent.",
  },
  {
    q: "What if my batch number doesn't return a result?",
    a: "Double-check the batch number for typos. If the issue persists, contact us with your order number and we will locate the correct certificate.",
  },
  {
    q: "Do you ship internationally?",
    a: "Shipping availability varies by destination and is subject to local regulations governing research chemicals. Contact us before ordering if you are uncertain about your region.",
  },
  {
    q: "Can I request additional documentation, such as a safety data sheet?",
    a: "Yes. Reach out via the Contact page with the product name and batch number, and we will provide any available supporting documentation.",
  },
];

export type ContactContent = {
  intro: string;
  email: string;
  hours: string;
  wholesaleNote: string;
};

export const DEFAULT_CONTACT: ContactContent = {
  intro:
    "Questions about a certificate of analysis, an order, or wholesale research accounts? Send a message below.",
  email: "research@vericert.example",
  hours: "Monday – Friday, 9am – 5pm ET",
  wholesaleNote: "Research institutions and laboratories may request volume pricing via the form.",
};

export type PoliciesContent = {
  privacy: string[];
  terms: string[];
  refund: string[];
  shipping: string[];
};

// Generic starter text only — review with counsel before relying on this.
export const DEFAULT_POLICIES: PoliciesContent = {
  privacy: [
    "VeriCert collects only the information required to process orders and provide account access: name, email, shipping address, and order history. We do not sell customer data.",
    "Payment is processed via third-party providers (cryptocurrency networks or your bank); VeriCert does not store full payment credentials.",
    "Contact us if you would like your account data exported or deleted.",
  ],
  terms: [
    "All products sold by VeriCert are intended strictly for in-vitro laboratory research and analytical use by qualified professionals. They are not drugs, foods, dietary supplements, or cosmetics, and are not intended for human or veterinary use.",
    "By placing an order, you certify that you are purchasing for laboratory research purposes only and are legally permitted to receive these materials in your jurisdiction.",
    "VeriCert reserves the right to refuse service or cancel orders at its discretion.",
  ],
  refund: [
    "Contact us within 14 days of delivery if your order arrived damaged, incorrect, or fails to match its certificate of analysis, and we will arrange a replacement or refund.",
    "Because these are laboratory research materials, opened or used products cannot be returned for reasons other than a quality issue.",
  ],
  shipping: [
    "Orders are shipped once payment has cleared. Processing typically begins within 1–2 business days of confirmed payment.",
    "Shipping availability varies by destination and is subject to local regulations governing research chemicals. Contact us before ordering if you are unsure about your region.",
  ],
};

export type SaleBannerContent = {
  active: boolean;
  message: string;
  linkHref?: string;
};

export const DEFAULT_SALE_BANNER: SaleBannerContent = {
  active: false,
  message: "",
  linkHref: "",
};
