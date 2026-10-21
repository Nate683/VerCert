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
  // Background photo of the homepage "Every Batch. Certified." section.
  certifiedImageUrl?: string;
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
    "Effective Date: October 19, 2026",
    "Parent Operating Entity: RKNEA Operations LLC",
    "Throughout this policy, \"VeriCert Peptides\" refers to the parent legal entity RKNEA Operations LLC. This policy outlines how customer account data, order records, and transaction metadata are processed and secured.",
    "Access to the VeriCert Peptides catalog, product information, and ordering requires registration. When an account is created we record name, email address, and shipping details. Passwords are stored using salted hashing. Access to the catalog is restricted to registered accounts.",
    "Order data, batch assignments, and shipment tracking information are processed for order fulfillment and record keeping.",
    "Payment methods available to customers are displayed at checkout. Payment transactions may be processed through authorized third-party payment service providers. VeriCert Peptides does not store complete payment card numbers on its own servers.",
    "## Analytics and Account Activity",
    "For signed-in accounts, we record product pages viewed, items added to the cart, and order history. This information is used to maintain inventory planning, improve catalog organization, and understand which compounds our customers require. It is not sold, shared with advertisers, or used to build profiles for third parties.",
    "Visits made while signed out are recorded the same way against a random session identifier kept in the visitor's browser: the pages viewed, products viewed, items added to the cart, and checkouts started. If the visitor later signs in, activity from that point is linked to their account.",
    "## Email Engagement",
    "Where we send transactional or informational email, we record whether a message was opened and whether links within it were followed. This is used to confirm delivery and to measure whether our communications are reaching registered accounts. Customers may opt out of non-essential email at any time from their account settings.",
    "## Customer Metrics and Segments",
    "From an account's orders, browsing, and email activity we calculate figures such as number of orders, total and average spend, first and most recent order dates, typical time between orders, most-purchased category, product views in the last 30 days, the last unfinished checkout, and email opens and clicks. Staff use these figures to group customers, for example to contact researchers who have not reordered in some time. Marketing email goes only to accounts that have opted in. These figures are not sold or shared with advertisers.",
    "## Referral and Partner Attribution",
    "Where an account is created through a partner or referral code, we record the referring code against that account for the purpose of attribution and partner compensation.",
    "On a first visit we also note how the visitor reached the site: a referral code in the link, campaign tags in the link (utm_source, utm_medium, utm_campaign), the website that linked to us, the first page visited, and the date. This is held in a cookie for up to 90 days and saved to the account if one is created.",
    "## AI-Assisted Store Administration",
    "Authorized VeriCert Peptides staff can use an AI assistant, provided by Anthropic, to answer operational questions about orders, revenue, inventory, and customers. When a staff member asks a question, the question and a summary of store data are sent to Anthropic to generate the answer. For up to 50 customer accounts, that summary can include the account email address, signup date, email verification and marketing preference status, number of orders, total spend, recent order references, totals and statuses, and internal staff notes. For up to 30 recent orders, it can include the order reference, status, payment method, total, date, and products ordered. It does not include passwords, shipping addresses, or payment details.",
    "The assistant is available only to staff accounts protected by two-factor authentication, and the data sent is used only to answer the staff member's question.",
    "## IP Addresses",
    "We use the IP address of each request to limit repeated sign-in, registration, and password-reset attempts. When an order is placed, we record the IP address alongside the research-use certification accepted at checkout, as evidence of that certification. Deleting an account removes those IP addresses from its orders.",
    "## Cookies and Browser Storage",
    "The storefront uses cookies only to run the site: to keep you signed in (up to 30 days), to remember that the age confirmation was accepted for the current visit, to give access to an order looked up by reference code (7 days), to hold the visit source described above (90 days), and, for staff, to complete two-factor sign-in. Your browser also stores your cart, recently viewed products, and the session identifier used for visit analytics. We do not use advertising or third-party tracking cookies.",
    "## Your Privacy Rights",
    "Residents of Texas, California, and other states with applicable privacy legislation have the right to request access to the personal data we hold about them, to request correction of inaccurate data, to request deletion of their data, and to receive a portable copy of their data. Requests may be submitted to info@vericertpeptides.com and will be responded to within the timeframe required by applicable law. We do not sell personal data and do not process it for targeted advertising.",
    "Data is processed on standard cloud infrastructure supporting this storefront, including hosting, database, and email delivery services. We do not display third-party advertisements, use advertising cookies, or sell customer data. Administrative access to customer data requires two-factor authentication.",
    "Customers may review, correct, update, or request deletion of their registration data by contacting us. Privacy inquiries go to info@vericertpeptides.com.",
  ],
  // DRAFT PENDING LEGAL REVIEW. The Terms of Sale below were written as a
  // complete plain-English draft on October 4, 2026 and have not been reviewed
  // by counsel. "## " starts a section heading and lines starting "- " form a
  // list (see components/PolicyPage.tsx).
  termsUpdated: "October 20, 2026",
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
    "Orders are processed upon verification of received payment. Available payment methods are clearly displayed during the checkout sequence and may vary based on jurisdiction and corporate compliance requirements.",
    "Buyers should review their order details carefully before submitting final authorization. Refund and return eligibility is governed by Section 13 of these Terms, subject to applicable law and payment-network requirements.",
    "Orders are matched to payments using the unique order reference code issued at checkout. Buyers must include the exact order reference code in the designated payment reference field when instructed at checkout. The Company is not responsible for shipment delays resulting from missing or inaccurate reference codes.",
    "We ship only once payment has been received in full and has cleared our commercial banking channels, which may take several business days depending on the selected settlement method.",
    "If a payment arrives without a reference code, with the wrong one, or from a name that does not match the Order, we may not be able to match it. Contact us with proof of payment and we will try to match it, but we are not responsible for delays caused by an unmatched payment. A payment we cannot match within 30 days may be returned to the account it came from, less any transfer fees.",
    "If you pay less than the Order total, we will hold the Order and ask you for the balance. If the balance is not paid within 7 days, we may cancel the Order and return what you paid, less any transfer fees. Overpayments are refunded the same way.",
    "Cryptocurrency payments must be for the amount, to the address and within the time shown on your order page. Payments sent to the wrong address, on the wrong network, in the wrong currency or after the payment window may not be recoverable.",
    "## Pricing and availability",
    "Prices are in U.S. dollars and are shown to signed-in customers. The price that applies is the one shown when you place your Order. Prices, sizes and availability can change at any time without notice. If a price or description is wrong because of an error, we may cancel the Order and offer it to you again at the correct price.",
    "Products, sizes and Lots are sold while supplies last. A Product being listed on the site does not mean it is in stock. Any sales tax and shipping charges are shown before you pay.",
    "## Shipping, title and risk of loss",
    "We ship to the address you give us, with tracking. Shipping times are estimates, not guarantees. You are responsible for giving a correct address and for knowing whether the Products may lawfully be delivered there. We do not ship to destinations where we believe delivery would break the law.",
    "Title to the Products, and the risk of loss or damage, pass to you when we hand the package to the carrier. If a package is lost, arrives damaged, or is delivered to an incorrect address, contact us within 5 calendar days of the expected delivery date or actual receipt, as applicable. We will help with the carrier claim and, where the claim succeeds, replace the Products or refund you.",
    "Packages that are refused, returned as undeliverable or not collected are not eligible for a refund of shipping costs, and we may charge for reshipping them.",
    "## Returns and refunds",
    "Our Products are temperature-sensitive research materials, and we cannot verify their condition once they leave our control. We do not accept returns of opened vials, or of any vial that has been exposed to temperatures outside its stated storage conditions, and, subject to applicable law, we give no refunds for them.",
    "We do not accept returns because you changed your mind or ordered the wrong item.",
    "If you receive the wrong Product, or a vial whose Lot does not match its published COA, tell us within 14 days of delivery and before opening it, with your order reference, the lot number and photos. Lost or damaged shipments are reported within the 5-day window under Shipping, title and risk of loss. If we confirm the problem, we will resolve it by replacement at no cost, or refund, at our choice. Subject to applicable law, that is your only remedy for a non-conforming Product.",
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
    "Because every batch is independently tested and quality controlled, and because these are temperature-sensitive research compounds, VeriCert Peptides generally does not accept returns of lyophilized reagents once a shipment has left our Texas facility. This policy helps reduce the risk of cross-contamination and protects the integrity of materials supplied for research use. Nothing in this policy limits any refund, replacement, or other remedy required by applicable law.",
    "If an order arrives with verifiable physical damage, contains an incorrect SKU, or shows an objective deviation supported by independent third-party analytical testing, please notify us at info@vericertpeptides.com. For lost, damaged, or incorrectly delivered shipments, customers should report the issue within 5 calendar days of the expected delivery date or actual receipt, as applicable, consistent with our Shipping Policy. For other product nonconformity claims, please contact us within 14 calendar days of recorded delivery. Include clear photographs and supporting documentation where available. VeriCert Peptides will review the claim and provide an appropriate resolution, which may include replacement or refund, subject to applicable law and payment-network requirements. These reporting periods do not limit rights or remedies that cannot legally be restricted.",
  ],
  shipping: [
    "Shipments are prepared and dispatched after payment has been received in full and cleared. Under normal operational cycles, packaging and carrier handoff typically occur within 1 to 2 business days. Estimated delivery timelines may vary based on stock availability, localized holidays, and unforeseen carrier delays.",
    "Delivery conditions and routing restrictions are subject to local regulations governing the transport of research compounds. Requisitioning entities bear sole responsibility for verifying that their designated receiving location permits the lawful acquisition and secure storage of the ordered items.",
    "The Company coordinates shipment through third-party carriers. Delivery timelines are estimates and may be affected by carrier disruptions, regulatory restrictions, or circumstances beyond the Company's reasonable control. Responsibility for lost or damaged shipments will be determined under the applicable Terms of Sale and governing law.",
    "## Lost or Damaged Shipments",
    "If a shipment is lost, damaged in transit, or delivered to an incorrect address, buyers should notify our administrative support team at info@vericertpeptides.com within 5 calendar days of the expected delivery date or actual receipt, as applicable.",
    "Please provide the order reference number, a description of the issue, and photographs of damaged packaging or products where available.",
    "Our team will review the report, assist with carrier investigations, and determine whether a replacement, refund, or other resolution is appropriate under our applicable policies and governing law.",
  ],
  dashboard: [
    "Operating Entity: RKNEA Operations LLC",
    "The authenticated account dashboard provides registered customers with access to their account profiles, saved shipping addresses, and historical order records.",
    "## Dashboard Features and Account Management",
    "Communication Preferences: Customers can manage available account communication preferences, including eligible order notifications and research documentation updates.",
    "Customer Data Export: Where available, customers may download a file containing their account information and order history.",
    "Account Deletion: Customers can permanently delete their account from the account page by re-entering their password. Deletion cannot be undone and ends access to the dashboard. It removes the account profile, name, email address, saved shipping address, communication preferences, browsing history, and email engagement records. Order records are kept for tax reporting and accounting, but they are no longer linked to the customer: the name, email address, and street address are removed from them, as is the IP address recorded with each order's research-use certification. The products, lot numbers, amounts, dates, and the state and country shipped to remain. Unpaid orders and any subscriptions are cancelled, and a confirmation is sent to the account's email address.",
    "An account cannot be deleted while an order is being prepared; it can be deleted once that order has shipped. Accounts linked to the partner program are closed on request, because commission and payout records must be kept. Copies of emails already exchanged with us, and our email provider's delivery records, are kept separately from the account. For any of these requests, or any other question about personal information, contact us at info@vericertpeptides.com.",
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
