import type { Affiliate, Order } from "@/lib/types";
import { getBankTransferDetails } from "@/lib/bank-details";
import { getSiteUrl } from "@/lib/site-url";
import { renderEmailHtml, renderEmailShell, renderCalloutBox, renderButton } from "@/lib/email-template";

// Sends via the Resend API with a branded black-and-gold HTML version
// auto-generated from the plain-text body, so every transactional email is
// on-brand with no per-email template work. Falls back to a console log if
// RESEND_API_KEY isn't configured yet, so auth/checkout flows still
// complete end-to-end in dev.
export async function sendMail(
  to: string,
  subject: string,
  text: string,
  opts?: { replyTo?: string }
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "VeriCert Research <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(
      `[email:dev-fallback] RESEND_API_KEY not set. Would have sent to ${to}:\nSubject: ${subject}\n\n${text}`
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      html: renderEmailHtml(subject, text),
      ...(opts?.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

export async function sendOrderConfirmationEmail(order: Order): Promise<void> {
  const subject = `VeriCert Order ${order.reference} Confirmed`;
  await sendMail(order.customer.email, subject, buildConfirmationBody(order));
}

export async function sendPaymentConfirmedEmail(order: Order): Promise<void> {
  const subject = `Payment Received — VeriCert Order ${order.reference}`;
  await sendMail(
    order.customer.email,
    subject,
    [
      `Hi ${order.customer.firstName},`,
      "",
      `We've confirmed payment for order ${order.reference} ($${order.total.toFixed(2)} USD). Your order is now processing.`,
      "",
      `Track your order any time at:`,
      `${siteUrl()}/order/${order.reference}`,
      "",
      "For research use only. Not for human or veterinary use.",
      "— VeriCert Research",
    ].join("\n")
  );
}

export async function sendShippingNotificationEmail(order: Order): Promise<void> {
  const subject = `Your VeriCert Order ${order.reference} Has Shipped`;
  await sendMail(order.customer.email, subject, buildShippingBody(order));
}

// Internal admin alerts (new order / low stock) — sent to whatever address
// is configured in the executive Notification Settings, not to the customer.
export async function sendAdminNotification(to: string, subject: string, text: string): Promise<void> {
  if (!to.trim()) return;
  await sendMail(to, `[VeriCert Admin] ${subject}`, text);
}

// Sent when an executive adds a new affiliate (or clicks "Resend Invite"),
// with the portal code they need — alongside their normal account
// email/password — to reach their personal /affiliate production page.
export async function sendAffiliateInviteEmail(affiliate: Affiliate): Promise<void> {
  const subject = "You've Been Added as a VeriCert Affiliate";
  const loginUrl = `${siteUrl()}/login`;
  const text = [
    `Hi ${affiliate.name},`,
    "",
    `You've been set up as a VeriCert affiliate. Here's how to access your personal production and commission dashboard:`,
    "",
    `1. Sign in (or create an account) at ${loginUrl} using this email address: ${affiliate.email}`,
    `2. Check the "I'm an Affiliate" box on the sign-in form.`,
    `3. Enter your affiliate code below when prompted.`,
    "",
    `Your Affiliate Code: ${affiliate.portalCode ?? "(not yet generated — ask us to resend this invite)"}`,
    "",
    `Once inside, you'll see your personal referral code, orders driven, and commission earned — updated live.`,
    "",
    "— VeriCert Research",
  ].join("\n");

  await sendMailWithHtml(
    affiliate.email,
    subject,
    text,
    `<p>Hi ${affiliate.name},</p>
     <p>You've been set up as a VeriCert affiliate. Here's how to access your personal production and commission dashboard:</p>
     <ol>
       <li>Sign in (or create an account) at ${renderInlineLink(loginUrl)} using this email address: <strong>${affiliate.email}</strong></li>
       <li>Check the "I'm an Affiliate" box on the sign-in form.</li>
       <li>Enter your affiliate code below when prompted.</li>
     </ol>
     ${affiliate.portalCode ? renderCalloutBox("Your Affiliate Code", affiliate.portalCode) : "<p>Ask us to resend this invite once your code is generated.</p>"}
     ${renderButton("Sign In", loginUrl)}
     <p>Once inside, you'll see your personal referral code, orders driven, and commission earned — updated live.</p>`
  );
}

// Contact-page submissions — sent to the business inbox configured on the
// Contact page, with reply-to set to the visitor so staff can just hit reply.
export async function sendContactFormEmail(input: {
  to: string;
  name: string;
  fromEmail: string;
  subject: string;
  message: string;
}): Promise<void> {
  const subject = `Contact Form: ${input.subject || "New Message"}`;
  const text = [
    `New message from the Contact page.`,
    "",
    `Name: ${input.name}`,
    `Email: ${input.fromEmail}`,
    "",
    input.message,
  ].join("\n");
  await sendMail(input.to, subject, text, { replyTo: input.fromEmail });
}

function renderInlineLink(href: string): string {
  return `<a href="${href}" style="color:#c9a227;text-decoration:underline;">${href}</a>`;
}

// Lower-level sender used when a call site wants a hand-built HTML body
// instead of the auto-generated (plain-text-derived) version.
async function sendMailWithHtml(to: string, subject: string, text: string, bodyHtml: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "VeriCert Research <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(
      `[email:dev-fallback] RESEND_API_KEY not set. Would have sent to ${to}:\nSubject: ${subject}\n\n${text}`
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text, html: renderEmailShell(subject, bodyHtml) }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

function buildItemLines(order: Order): string {
  return order.items
    .map((item) => `  - ${item.name} (${item.sizeLabel}) x${item.quantity} — $${(item.priceUsd * item.quantity).toFixed(2)}`)
    .join("\n");
}

function buildConfirmationBody(order: Order): string {
  const lines = [
    `Hi ${order.customer.firstName},`,
    "",
    `Thank you for your order. Here's a summary for your records.`,
    "",
    `Order number: ${order.reference}`,
    `Items:`,
    buildItemLines(order),
    `Total: $${order.total.toFixed(2)} USD`,
    "",
  ];

  if (order.paymentMethod === "bank_transfer") {
    const d = getBankTransferDetails();
    lines.push(
      `Please complete payment via bank transfer using the details below.`,
      `Your order will remain in "awaiting payment" status until funds are received and confirmed.`,
      "",
      `IMPORTANT: Include the order reference (${order.reference}) in your transfer memo so we can match your payment.`,
      "",
      "Bank Transfer Details",
      "----------------------",
      `Account Name: ${d.accountName}`,
      `Bank Name: ${d.bankName}`,
      `Account Number: ${d.accountNumber}`,
      `Routing Number: ${d.routingNumber}`,
      `SWIFT/BIC: ${d.swiftBic}`,
      `Account Type: ${d.accountType}`,
      ""
    );
  } else {
    lines.push(
      `Complete your crypto payment from your order page — the payment window is time-limited:`,
      `${siteUrl()}/order/${order.reference}`,
      ""
    );
  }

  lines.push("For research use only. Not for human or veterinary use.", "— VeriCert Research");
  return lines.join("\n");
}

function buildShippingBody(order: Order): string {
  return [
    `Hi ${order.customer.firstName},`,
    "",
    `Your VeriCert order ${order.reference} has shipped.`,
    "",
    order.carrier ? `Carrier: ${order.carrier}` : undefined,
    order.trackingNumber ? `Tracking number: ${order.trackingNumber}` : undefined,
    "",
    `Track your order any time at:`,
    `${siteUrl()}/order/${order.reference}`,
    "",
    "For research use only. Not for human or veterinary use.",
    "— VeriCert Research",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function siteUrl(): string {
  return getSiteUrl();
}

