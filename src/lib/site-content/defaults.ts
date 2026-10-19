// Default/fallback copy for every editable site-content key — this is what
// renders until the CEO edits something from the /command Content tab, so
// the storefront looks identical to today even with an empty site_content
// table (e.g. right after `db:migrate` on a fresh database).

export type HomeHeroContent = {
  badge: string;
  headline: string; // "\n" renders as a line break
  subtext: string;
  ctaPrimaryLabel: string;
  // No longer shown: certificate lookup is reached from the header emblem.
  ctaSecondaryLabel?: string;
  heroImageUrl?: string;
};

export const DEFAULT_HOME_HERO: HomeHeroContent = {
  badge: "Research Use Only",
  headline: "Research Peptides,\nVerified to the Batch.",
  subtext:
    "VeriCert supplies high-purity synthetic peptides and reference compounds for laboratory research, each accompanied by an independent certificate of analysis.",
  ctaPrimaryLabel: "Shop the Collection",
};

export type FeaturedContent = { slugs: string[] }; // empty = auto (first 4 by sort order)
export const DEFAULT_FEATURED: FeaturedContent = { slugs: [] };

export type HomeSectionsContent = {
  trust: boolean;
  cta: boolean;
};

export const DEFAULT_HOME_SECTIONS: HomeSectionsContent = { trust: true, cta: true };

export type AboutPillar = { title: string; body: string };

export type AboutContent = {
  headline: string;
  intro: string;
  valuesHeading: string;
  valuesIntro: string;
  pillars: AboutPillar[];
};

// Owner-supplied text, October 18, 2026: three value cards only; more will
// be added once the owner has confirmed what is accurate.
export const DEFAULT_ABOUT: AboutContent = {
  headline: "Built for the Bench, Not the Bottle",
  intro:
    "Access to the VeriCert Peptides chemical catalog, batch analytical records, and inventory metrics is restricted to verified independent, corporate, and institutional research entities. Accounts are established for professional credentialing and procurement authentication purposes.",
  valuesHeading: "Our Core Values",
  valuesIntro:
    "At VeriCert Peptides, we stand for analytical precision and supply chain transparency. Our operations are built on independent scientific verification, designed to meet the requirements of independent, corporate, and academic research institutions. We do not participate in consumer retail marketing. We hold a clinical operational standard across our catalog to protect the continuity of your laboratory work.",
  pillars: [
    {
      title: "Independent Validation",
      body: "Every compound distributed under the VeriCert framework undergoes independent third-party laboratory validation. Reverse-phase HPLC purity profiles and mass spectrometry identity confirmation are completed before a lot is released.",
    },
    {
      title: "Traceability from Lot to Certificate",
      body: "Every vial carries a batch number that maps to its certificate of analysis. Certificates come from the testing laboratory directly, so the chain from lot to document stays unbroken.",
    },
    {
      title: "Professional Reagent Standards",
      body: "Our infrastructure serves qualified research professionals. Compounds ship as stable lyophilized formulations with precise mass specifications and packaging designed to protect against light exposure, physical damage, and moisture during transit.",
    },
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
  phone: string;
  address: string;
  hours: string;
  wholesaleNote: string;
};

export const DEFAULT_CONTACT: ContactContent = {
  intro:
    "Questions about a certificate of analysis, an order, or wholesale research accounts? Send a message below.",
  email: "info@vericertpeptides.com",
  phone: "Add your business phone — edit in EXEC MODE",
  address: "Add your business address — edit in EXEC MODE",
  hours: "Monday – Friday, 9am – 5pm CT",
  wholesaleNote: "Research institutions and laboratories may request volume pricing via the form.",
};

export type PoliciesContent = {
  privacy: string[];
  terms: string[];
  // Shown as "Last updated …" on the Terms of Sale page. Optional so content
  // saved before it existed still parses (the page falls back to the default).
  termsUpdated?: string;
  refund: string[];
  shipping: string[];
  // Optional so content saved before it existed still parses (the page falls
  // back to the default).
  dashboard?: string[];
};

// Generic starter text only — review with counsel before relying on this.
export const DEFAULT_POLICIES: PoliciesContent = {
  // Owner-supplied text, October 18, 2026.
  privacy: [
    "Effective Date: October 14, 2026",
    "Parent Operating Entity: RKNEA Operations LLC",
    "Throughout this policy, \"VeriCert Peptides\" refers to the parent legal entity RKNEA Operations LLC. This policy outlines how customer account data, order records, and transaction metadata are processed and secured.",
    "Access to the VeriCert Peptides catalog, product information, and ordering requires registration. When an account is created we record name, email address, and shipping details. Passwords are stored using salted hashing. Access to the catalog is restricted to registered accounts.",
    "Order data, batch assignments, and shipment tracking information are processed for order fulfillment and record keeping. Payment is handled through direct bank transfer and cryptocurrency. VeriCert Peptides does not collect, view, transmit, or store credit card numbers or customer bank account numbers on its servers.",
    "Data is processed on standard cloud infrastructure supporting this storefront, including hosting, database, and email delivery services. We do not display third-party advertisements, use advertising cookies, or sell customer data. Administrative access to customer data requires two-factor authentication.",
    "Customers may review, correct, update, or request deletion of their registration data by contacting us. Privacy inquiries go to info@vericertpeptides.com.",
  ],
  // DRAFT PENDING LEGAL REVIEW. The Terms of Sale below were written as a
  // complete plain-English draft on October 4, 2026 and have not been reviewed
  // by counsel. "## " starts a section heading and lines starting "- " form a
  // list (see components/PolicyPage.tsx).
  termsUpdated: "October 18, 2026",
  terms: [
    "These Terms of Sale apply to every order placed with VeriCert Peptides. They are a binding agreement between you and us. Please read them before you order: by creating an account or placing an order, you accept them.",
    "## Definitions",
    "- \"VeriCert Peptides\" is a wholly owned brand and storefront of RKNEA Operations LLC. Throughout these Terms, the phrases \"VeriCert\", \"we\", \"us\", \"our\", and \"the seller\" refer explicitly to RKNEA Operations LLC.\n- \"You\" and \"Buyer\" mean the person placing the order and, if that person orders for a company, laboratory or institution, that organization as well.\n- \"Products\" means the research compounds, reference materials and laboratory supplies we sell.\n- \"Lot\" means a single production batch of a Product, identified by the lot number printed on the vial label.\n- \"COA\" means a certificate of analysis: a report of laboratory testing performed on a sample from a Lot.\n- \"Order\" means a request to buy Products placed through this website.\n- \"Research Use\" means in-vitro laboratory research and analytical work carried out by qualified people in a suitable laboratory setting.",
    "## Eligibility",
    "To buy from us you must be at least 21 years old, and you must be buying for Research Use only. You must be a qualified researcher, or be buying on behalf of a laboratory, company or institution that does research, and you must be legally allowed to buy, receive and handle these materials where you are.",
    "This is not a consumer sale. Our Products are not consumer goods, and we do not sell them to the general public for personal use. If you cannot meet every requirement in this section, do not place an order.",
    "## Research Use Only",
    "Every Product we sell is for Research Use only. Products are not drugs, foods, dietary supplements, cosmetics or medical devices. They have not been evaluated or approved by the U.S. Food and Drug Administration or any other regulator for any use in people or animals, and they are not intended to diagnose, treat, cure, mitigate or prevent any disease or condition.",
    "Products must be handled only by people trained in laboratory safety, using appropriate protective equipment, and must be kept away from anyone who is not.",
    "## Your representations and warranties",
    "Each time you place an Order, you confirm that:",
    "- you are at least 21 years old;\n- you are buying for Research Use only, and not for any use listed under Prohibited uses;\n- you, or the organization you buy for, have the training, facilities and any licenses or permits needed to handle the Products safely and lawfully;\n- buying, importing, receiving and possessing the Products is lawful where they will be delivered and used;\n- the information you give us (name, email, shipping address and anything else) is true and complete; and\n- you will not resell or pass the Products to anyone else except in a way that keeps them for Research Use and binds that person to these same restrictions.",
    "If any of these statements stops being true, you must not use the Products for anything other than lawful disposal, and you must tell us.",
    "## Prohibited uses",
    "You may not use, sell or supply any Product:",
    "- for human consumption of any kind, or for introduction into the human body by any route;\n- for veterinary use, or for introduction into any animal;\n- for resale to anyone who intends to use it in people, or any resale marketed for personal use;\n- in clinical settings, clinical trials or patient care; or\n- in any way that breaks a law or regulation that applies to you.",
    "Products are strictly intended for laboratory in-vitro research and analytical testing applications only. Resale or compounding for downstream clinical, medical, therapeutic, diagnostic, or dietary formulation applications is strictly prohibited.",
    "We will cancel any Order, and may close any account, where we believe a Product is meant for a prohibited use. We may also refuse future Orders from you.",
    "## No medical advice",
    "Nothing we publish or say is medical, health, dietary or veterinary advice. That includes product pages, descriptions, specifications, certificates, emails, social media posts and replies from our staff. We do not advise on, and will not answer questions about, using any Product in people or animals. Any reference to published research on a compound is given for scientific context only. If you have a health question, speak to a licensed medical professional.",
    "## Product descriptions and specifications",
    "We try to describe every Product accurately. Product pages may show a name, size, physical form, purity, CAS number, molecular formula, molecular weight, sequence and storage conditions.",
    "What we represent: the Product you receive is the compound named on the label, in the stated amount and physical form, from the Lot printed on the vial.",
    "What we do not represent: that a Product is fit for any particular research purpose, or that it will produce any particular result. Figures such as purity describe testing of a Lot, not a guarantee for every vial in every condition. Photos and renders are for illustration; labels, caps and packaging may look different. Chemical data such as CAS numbers, formulas and molecular weights come from published references and may be given for a reference form of the compound. Where a field is blank, we have not published that information.",
    "## Certificates of analysis",
    "What a COA is: a report of tests performed on a sample taken from a specific Lot, such as identity and purity testing. Each COA applies only to the Lot number printed on it. A COA for one Lot says nothing about any other Lot, even of the same Product.",
    "To match a COA to your vial, use the lot number on the vial label. If no COA has been published for a Lot yet, we will tell you so. We do not issue a certificate for a Lot that has not been tested.",
    "What a COA does not do: it does not warrant that a Product is suitable for any purpose, and it does not certify any use in people or animals. It reflects the sample at the time it was tested. It does not cover changes after delivery, including those caused by storage, handling or temperature, or by anything the Buyer does with the Product. Test methods and their limits are as stated on the COA.",
    "## Orders and acceptance",
    "Placing an Order is an offer to buy. A confirmation page or email saying we have received your Order is not acceptance. We accept an Order only when we ship it.",
    "We may refuse or cancel any Order, in whole or in part, at any time before it ships. Reasons include, among others: we cannot confirm you meet the eligibility requirements; we believe a Product is meant for a prohibited use; there is an error in price, description or availability; payment is not received in full; the Product is out of stock; or shipping to your address would break the law. If we cancel an Order you have paid for, we refund what you paid for the cancelled items, as described under Payment terms.",
    "## Payment terms",
    "Orders are processed upon verification of received payment. Available payment methods are displayed at checkout and currently include bank transfer (ACH and wire) and cryptocurrency. RKNEA Operations LLC does not currently accept credit or debit cards. Payment methods available to a given order may vary based on jurisdiction and compliance requirements.",
    "Because these payment methods settle directly and are not routed through card networks, they do not carry chargeback or card-network dispute rights. Buyers should review their order carefully before sending payment. Refund and return eligibility is governed solely by the Refund and Returns section of these Terms.",
    "Every Order has a reference code. You must include the exact reference code with your payment, in the memo, reference or note field, so we can match the payment to your Order. Payment instructions are shown on your order page and sent by email.",
    "We ship only once payment has been received in full and has cleared. For bank transfers that can take several business days.",
    "If a payment arrives without a reference code, with the wrong one, or from a name that does not match the Order, we may not be able to match it. Contact us with proof of payment and we will try to match it, but we are not responsible for delays caused by an unmatched payment. A payment we cannot match within 30 days may be returned to the account it came from, less any transfer fees.",
    "If you pay less than the Order total, we will hold the Order and ask you for the balance. If the balance is not paid within 7 days, we may cancel the Order and return what you paid, less any transfer fees. Overpayments are refunded the same way.",
    "Cryptocurrency payments must be for the amount, to the address and within the time shown on your order page. Payments sent to the wrong address, on the wrong network, in the wrong currency or after the payment window may not be recoverable.",
    "## Pricing and availability",
    "Prices are in U.S. dollars and are shown to signed-in customers. The price that applies is the one shown when you place your Order. Prices, sizes and availability can change at any time without notice. If a price or description is wrong because of an error, we may cancel the Order and offer it to you again at the correct price.",
    "Products, sizes and Lots are sold while supplies last. A Product being listed on the site does not mean it is in stock. Any sales tax and shipping charges are shown before you pay.",
    "## Shipping, title and risk of loss",
    "We ship to the address you give us, with tracking. Shipping times are estimates, not guarantees. You are responsible for giving a correct address and for knowing whether the Products may lawfully be delivered there. We do not ship to destinations where we believe delivery would break the law.",
    "Title to the Products, and the risk of loss or damage, pass to you when we hand the package to the carrier. If a package is lost or arrives damaged, contact us within 14 days of the delivery date shown by the carrier, or of the expected delivery date if it never arrives. We will help with the carrier claim and, where the claim succeeds, replace the Products or refund you.",
    "Packages that are refused, returned as undeliverable or not collected are not eligible for a refund of shipping costs, and we may charge for reshipping them.",
    "## Returns and refunds",
    "Our Products are temperature-sensitive research materials, and we cannot verify their condition once they leave our control. We do not accept returns of opened vials, or of any vial that has been exposed to temperatures outside its stated storage conditions, and we give no refunds for them.",
    "We do not accept returns because you changed your mind or ordered the wrong item.",
    "If you receive the wrong Product, a damaged vial, or a vial whose Lot does not match its published COA, tell us within 14 days of delivery and before opening it, with your order reference, the lot number and photos. If we confirm the problem, we will replace the Product or refund its price, at our choice. That is your only remedy for a non-conforming Product.",
    "Approved refunds are paid within 10 business days, back to the account the payment came from where possible, otherwise by bank transfer to an account in your name.",
    "## Storage and handling after delivery",
    "Once a package has been delivered, storing and handling the Products correctly is your responsibility. Follow the storage conditions on the product page and label: refrigerate or freeze promptly where stated, protect from light and moisture, and keep containers sealed until needed. We are not responsible for any loss of quality caused by storage, handling or use after delivery, or by a delay in collecting a delivered package.",
    "You are responsible for safe handling and lawful disposal of Products and their containers under the laws and laboratory rules that apply to you.",
    "## Limitation of liability",
    "To the fullest extent the law allows:",
    "- Products are provided \"as is\", except as stated under Product descriptions and specifications and under Returns and refunds. We disclaim all other warranties, express or implied, including any warranty of merchantability, fitness for a particular purpose and non-infringement.\n- We are not liable for any indirect, incidental, special, consequential or punitive damages, or for lost profits, lost data, lost research or business interruption, even if we were told they were possible.\n- We are not liable for any injury, illness, loss or damage arising from use of a Product in people or animals, from any other prohibited use, or from failure to follow these Terms.\n- Our total liability for any claim relating to an Order is limited to the amount you paid us for that Order.",
    "Some places do not allow certain limits on liability. In those places these limits apply as far as the law allows.",
    "## Indemnification",
    "You agree to defend, indemnify and hold harmless VeriCert Peptides, its owners, employees, and agents against any claim, loss, liability, penalty, cost or expense (including reasonable attorneys' fees) arising from: your breach of these Terms; your use, handling, storage, resale or disposal of any Product; any prohibited use of a Product by you or by anyone you supplied it to; or your breach of any law.",
    "## Governing law and venue",
    "These Terms, and any dispute about them or about any Order, are governed by the laws of the State of Texas, without regard to its conflict-of-law rules. Subject to the dispute resolution section below, the state and federal courts located in Texas have exclusive jurisdiction, and you agree to their jurisdiction and venue.",
    "## Dispute resolution",
    "In the event of a dispute, the Buyer agrees to contact the Company directly to allow an opportunity for administrative resolution. All correspondence must explicitly state the nature of the issue, the matching order reference code, and the requested remedy. Both parties agree to act in good faith to resolve the matter within 30 calendar days.",
    "If the matter is not resolved within this window, either party may bring a claim in the courts named within these Terms, or within a qualifying small-claims court. All claims must be brought exclusively in an individual capacity, and the Buyer explicitly waives all rights to participate as a plaintiff or class member in any class or representative action. Any legal claim must be filed within one year after the cause of action arises, or it shall be permanently barred.",
    "## Changes to these Terms",
    "We may change these Terms from time to time. When we do, we will update the date at the top of this page. Changes apply to Orders placed after they are posted; the Terms in force when you placed an Order apply to that Order. If we make a significant change, we will also tell account holders by email.",
    "## Severability and general terms",
    "If any part of these Terms is found invalid or unenforceable, that part will be limited or removed only as far as needed, and the rest stays in full force. Our failure to enforce any part of these Terms is not a waiver of it. These Terms, together with our Privacy Policy, Refund Policy and Shipping Policy, are the entire agreement between you and us about your purchases; if they conflict, these Terms apply. You may not transfer your rights under these Terms without our written consent.",
    "## Contact",
    "Questions about these Terms can be sent through our Contact page.",
  ],
  // Owner-supplied text, October 18, 2026. Note: the Terms say they prevail
  // over these policies where they conflict (Severability and general terms).
  refund: [
    "Because every batch is independently validated and quality controlled, and because these are temperature-sensitive research compounds, all sales are final. RKNEA Operations LLC d/b/a VeriCert Peptides operates a no-return, no-restock policy for all lyophilized reagents once a shipment has left our Texas facility. This prevents cross-contamination and ensures every compound remains suitable for research use.",
    "If an order arrives with verifiable physical damage, an incorrect SKU, or shows an objective deviation under independent third-party analytical validation by an accredited testing facility, notify us at info@vericertpeptides.com within 14 calendar days of recorded delivery. Claims must include clear photographs and supporting documentation. Approved claims are resolved by replacement at no cost or by account credit.",
  ],
  shipping: [
    "Shipments are dispatched after payment has been received in full and cleared. Processing, packaging in temperature-stable configurations, and courier handoff typically occur within 1 to 2 business days following payment verification. Because VeriCert Peptides maintains cold storage for its inventory prior to dispatch, shipping is coordinated with active inventory control.",
    "Availability, routing restrictions, and delivery timelines are subject to local regulations governing the transport of research chemical compounds. Buyers are solely responsible for verifying that their receiving location and local regulations permit the lawful acquisition and storage of the ordered compounds. RKNEA Operations LLC holds no liability for transit delays, routing exceptions, or delivery holds resulting from carrier disruptions, regulatory enforcement, or force majeure once a shipment has been transferred to the carrier.",
  ],
  dashboard: [
    "Operating Entity: RKNEA Operations LLC",
    "The authenticated account dashboard gives registered customers access to their profile, saved shipping addresses, and order records. Interface labels use research and laboratory terminology consistent with the nature of the products.",
    "Communication preferences cover order notifications, availability updates, and certificate of analysis postings. Customers may export their data as a JSON file containing their profile, order records, and session logs.",
    "Account deactivation removes profile information, email, and saved addresses from the storefront. Order and transaction records are retained separately for tax reporting and accounting requirements as required by Texas state law and standard business practice.",
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

export type NotificationSettings = {
  emailAddress: string;
  notifyNewOrder: boolean;
  notifyLowStock: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailAddress: "",
  notifyNewOrder: false,
  notifyLowStock: false,
};

export type CommissionStructureContent = {
  paragraphs: string[];
};

export const DEFAULT_COMMISSION_STRUCTURE: CommissionStructureContent = {
  paragraphs: [
    "Standard affiliate commission is 10% of the order subtotal, paid monthly once the balance owed exceeds $50.",
    "Custom rates can be set per affiliate below — either a percentage of each sale or a flat amount per order.",
  ],
};
