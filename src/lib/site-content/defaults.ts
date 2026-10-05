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
  phone: string;
  address: string;
  hours: string;
  wholesaleNote: string;
};

export const DEFAULT_CONTACT: ContactContent = {
  intro:
    "Questions about a certificate of analysis, an order, or wholesale research accounts? Send a message below.",
  email: "Add your business email — edit in EXEC MODE",
  phone: "Add your business phone — edit in EXEC MODE",
  address: "Add your business address — edit in EXEC MODE",
  hours: "Monday – Friday, 9am – 5pm ET",
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
};

// Generic starter text only — review with counsel before relying on this.
export const DEFAULT_POLICIES: PoliciesContent = {
  privacy: [
    "Effective September 14, 2026. This policy explains what VeriCert Research collects when you use this website, why we collect it, and the choices you have.",
    "When you create an account: your name, email address and a password (stored only as a salted hash), plus — only if you choose to give them — your company or lab and how you heard about us. We record that you confirmed you are 21 or older, and when; we never ask for a date of birth. We also record whether you've agreed to receive marketing email.",
    "When you order: your shipping address, and a record of the order — products, sizes, quantities and lot numbers, prices, discounts, dates and payment status. Lot numbers connect every vial to its certificate of analysis. Payments are handled by third-party processors (a cryptocurrency payment provider, or your bank for transfers); we never receive or store card numbers or bank credentials.",
    "While you use the site: when you're signed in, we record the products you view and what you add to your cart or take to checkout, so we understand what researchers are interested in and can follow up on an unfinished order. We note how you first reached us — an affiliate's referral link, a campaign tag in a link, or the website that linked to us. For the emails we send, our email provider tells us whether each one was delivered, opened or clicked.",
    "What we work out from that: from your order history we calculate figures such as how many orders you've placed, your total and average spend, how often you reorder, and the kind of product you buy most. We use them to group customers for our own emails — for example, a note to researchers who haven't reordered in a while. Only VeriCert and the service that sends our email use them, and they are never sold.",
    "What we don't collect: government ID, payment card numbers, health information, or descriptions of how you intend to use a product.",
    "Who we share it with: only the services that run the store for us — website hosting (Vercel), database hosting (Neon), email delivery (Resend) and payment processing — and only as needed to provide those services, or where the law requires it. Affiliates see the orders placed with their code and their value, never your name or contact details. We don't sell personal information, use it for targeted advertising, or run third-party advertising trackers.",
    "Your choices: from your account page you can download a copy of your data at any time, and delete your account. Deleting removes your name, email, addresses, browsing history and email preferences; we keep records of past orders for accounting and tax, with your details removed and only the state and country shipped to retained. You can change your email address from your account, unsubscribe from marketing email with the link in any message or the setting in your account, and ask us to correct anything else.",
    "Your rights: depending on where you live — including Texas and California — you have the right to know what we hold about you and get a copy, to have it corrected or deleted, and to opt out of the sale of personal data or its use for targeted advertising (we do neither). We respond to requests within 45 days. If we can't complete one, we'll explain why, and you can appeal by contacting us; we'll answer an appeal within 60 days. We won't treat you differently for using these rights.",
    "How long we keep it: account data for as long as your account is open, and order records for as long as tax and accounting rules require. Passwords are hashed, connections are encrypted, and staff accounts are protected with two-factor authentication.",
    "Contact: send any privacy question or request through our Contact page. If we change this policy in a meaningful way, we'll update the date above and tell account holders by email.",
  ],
  // DRAFT PENDING LEGAL REVIEW. The Terms of Sale below were written as a
  // complete plain-English draft on October 4, 2026 and have not been reviewed
  // by counsel. "## " starts a section heading and lines starting "- " form a
  // list (see components/PolicyPage.tsx).
  termsUpdated: "October 4, 2026",
  terms: [
    "These Terms of Sale apply to every order placed with VeriCert Research. They are a binding agreement between you and us. Please read them before you order: by creating an account or placing an order, you accept them.",
    "## Definitions",
    "- \"VeriCert\", \"we\", \"us\" and \"our\" mean VeriCert Research, the seller.\n- \"You\" and \"Buyer\" mean the person placing the order and, if that person orders for a company, laboratory or institution, that organization as well.\n- \"Products\" means the research compounds, reference materials and laboratory supplies we sell.\n- \"Lot\" means a single production batch of a Product, identified by the lot number printed on the vial label.\n- \"COA\" means a certificate of analysis: a report of laboratory testing performed on a sample from a Lot.\n- \"Order\" means a request to buy Products placed through this website.\n- \"Research Use\" means in-vitro laboratory research and analytical work carried out by qualified people in a suitable laboratory setting.",
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
    "- for human consumption of any kind, or for introduction into the human body by any route;\n- for veterinary use, or for introduction into any animal;\n- for resale to anyone who intends to use it in people, or any resale marketed for personal use;\n- in clinical settings, clinical trials or patient care;\n- for compounding, or as an ingredient in any drug, supplement, food, cosmetic or other product; or\n- in any way that breaks a law or regulation that applies to you.",
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
    "We take payment by manual settlement: bank transfer (ACH or wire), Zelle where we offer it, and cryptocurrency. We do not take credit or debit cards.",
    "Every Order has a reference code. You must include the exact reference code with your payment, in the memo, reference or note field, so we can match the payment to your Order. Payment instructions are shown on your order page and sent by email.",
    "We ship only once payment has been received in full and has cleared. For bank transfers that can take several business days.",
    "If a payment arrives without a reference code, with the wrong one, or from a name that does not match the Order, we may not be able to match it. Contact us with proof of payment and we will try to match it, but we are not responsible for delays caused by an unmatched payment. A payment we cannot match within 30 days may be returned to the account it came from, less any transfer fees.",
    "If you pay less than the Order total, we will hold the Order and ask you for the balance. If the balance is not paid within 7 days, we may cancel the Order and return what you paid, less any transfer fees. Overpayments are refunded the same way.",
    "Cryptocurrency payments must be for the amount, to the address and within the time shown on your order page. Payments sent to the wrong address, on the wrong network, in the wrong currency or after the payment window may not be recoverable.",
    "Bank transfers, Zelle and cryptocurrency payments are final once sent. None of them has a chargeback or dispute process like a card payment, so check the amount and the recipient before you pay. Any refund we owe is paid by us directly; it is never a reversal by your bank or wallet provider.",
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
    "You agree to defend, indemnify and hold harmless VeriCert and its owners, employees and agents against any claim, loss, liability, penalty, cost or expense (including reasonable attorneys' fees) arising from: your breach of these Terms; your use, handling, storage, resale or disposal of any Product; any prohibited use of a Product by you or by anyone you supplied it to; or your breach of any law.",
    "## Governing law and venue",
    "These Terms, and any dispute about them or about any Order, are governed by the laws of the State of Texas, without regard to its conflict-of-law rules. Subject to the dispute resolution section below, the state and federal courts located in Texas have exclusive jurisdiction, and you agree to their jurisdiction and venue.",
    "## Dispute resolution",
    "If you have a dispute with us, contact us first and give us a chance to put it right. Tell us what the problem is, your order reference and what you would like us to do. We will both try in good faith to resolve it within 30 days.",
    "If it is not resolved, either of us may bring a claim in the courts named above, or in a small-claims court where the claim qualifies. Claims may be brought only in your or our individual capacity, not as a plaintiff or class member in a class or representative action. Any claim must be brought within one year after it arises, or it is permanently barred, unless the law requires a longer period.",
    "## Changes to these Terms",
    "We may change these Terms from time to time. When we do, we will update the date at the top of this page. Changes apply to Orders placed after they are posted; the Terms in force when you placed an Order apply to that Order. If we make a significant change, we will also tell account holders by email.",
    "## Severability and general terms",
    "If any part of these Terms is found invalid or unenforceable, that part will be limited or removed only as far as needed, and the rest stays in full force. Our failure to enforce any part of these Terms is not a waiver of it. These Terms, together with our Privacy Policy, Refund Policy and Shipping Policy, are the entire agreement between you and us about your purchases; if they conflict, these Terms apply. You may not transfer your rights under these Terms without our written consent.",
    "## Contact",
    "Questions about these Terms can be sent through our Contact page.",
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
