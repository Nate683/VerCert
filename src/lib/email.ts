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
// with a link to set their password — alongside their email address — to
// reach their personal /partner production page. Reuses the standard
// reset-password page/flow so there's no bespoke set-password UI.
export async function sendAffiliateInviteEmail(affiliate: Affiliate, setPasswordToken: string): Promise<void> {
  const subject = "You've Been Added as a VeriCert Affiliate";
  const setPasswordUrl = `${siteUrl()}/reset-password?token=${setPasswordToken}`;
  const partnerUrl = `${siteUrl()}/partner`;
  const text = [
    `Hi ${affiliate.name},`,
    "",
    `You've been set up as a VeriCert affiliate. Set your password to access your personal production and commission dashboard:`,
    "",
    setPasswordUrl,
    "",
    `This link expires in 24 hours. Once you've set a password, sign in any time at ${partnerUrl} with this email address: ${affiliate.email}`,
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
     <p>You've been set up as a VeriCert affiliate. Set your password to access your personal production and commission dashboard:</p>
     ${renderButton("Set Your Password", setPasswordUrl)}
     <p>This link expires in 24 hours. Once you've set a password, sign in any time at ${renderInlineLink(partnerUrl)} with this email address: <strong>${affiliate.email}</strong></p>
     <p>Once inside, you'll see your personal referral code, orders driven, and commission earned — updated live.</p>`
  );
}

// Sent the moment a command-only invite code is generated for a specific
// email — the prospective affiliate never has to be handed the code by
// hand. The signup link pre-fills the invite code via a query param.
export async function sendInviteCodeEmail(input: {
  email: string;
  code: string;
  tierLabel: string;
}): Promise<void> {
  const subject = "You're Invited to Become a VeriCert Affiliate";
  const signupUrl = `${siteUrl()}/signup?affiliate=1&code=${encodeURIComponent(input.code)}`;
  const text = [
    `Hi,`,
    "",
    `You've been invited to join the VeriCert Partner Program as a ${input.tierLabel} affiliate.`,
    "",
    `Your invite code: ${input.code}`,
    "",
    `Create your account here (your invite code is already filled in):`,
    signupUrl,
    "",
    `This code is single-use and tied to this email address.`,
    "",
    "— VeriCert Research",
  ].join("\n");

  await sendMailWithHtml(
    input.email,
    subject,
    text,
    `<p>Hi,</p>
     <p>You've been invited to join the VeriCert Partner Program as a <strong>${input.tierLabel}</strong> affiliate.</p>
     ${renderCalloutBox("Your Invite Code", input.code)}
     ${renderButton("Create Your Account", signupUrl)}
     <p>This code is single-use and tied to this email address.</p>`
  );
}

// Sent immediately after a public /partner/apply submission, before any
// review has happened — confirms mailbox ownership only.
export async function sendAffiliateApplicationVerificationEmail(input: {
  name: string;
  email: string;
  token: string;
}): Promise<void> {
  const subject = "Verify Your VeriCert Partner Application";
  const verifyUrl = `${siteUrl()}/api/partner/verify-email?token=${input.token}`;
  const text = [
    `Hi ${input.name},`,
    "",
    `Thanks for applying to the VeriCert Partner Program. Please verify your email address by visiting:`,
    verifyUrl,
    "",
    `This link expires in 24 hours. Verifying doesn't approve your application — our team still reviews every applicant and will email you once a decision is made.`,
    "",
    "— VeriCert Research",
  ].join("\n");
  await sendMail(input.email, subject, text);
}

// Sent when /command approves a pending application — the affiliate is now
// live with a real promo code and commission tier.
export async function sendAffiliateApprovedEmail(affiliate: Affiliate, code: string): Promise<void> {
  const subject = "You're Approved — Welcome to the VeriCert Partner Program";
  const partnerUrl = `${siteUrl()}/partner`;
  const text = [
    `Hi ${affiliate.name},`,
    "",
    `Great news — your VeriCert affiliate application has been approved. You're live.`,
    "",
    `Your Promo Code: ${code}`,
    "",
    `Sign in any time at ${partnerUrl} with the email and password you applied with to see your referral code, orders driven, and commission earned — updated live.`,
    "",
    "— VeriCert Research",
  ].join("\n");

  await sendMailWithHtml(
    affiliate.email,
    subject,
    text,
    `<p>Hi ${affiliate.name},</p>
     <p>Great news — your VeriCert affiliate application has been approved. You're live.</p>
     ${renderCalloutBox("Your Promo Code", code)}
     ${renderButton("Sign In to the Partner Portal", partnerUrl)}
     <p>Sign in any time with the email and password you applied with to see your referral code, orders driven, and commission earned — updated live.</p>`
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

// Auto-acknowledgment sent to the visitor themselves, confirming receipt.
export async function sendContactAutoAckEmail(input: { toName: string; toEmail: string }): Promise<void> {
  const subject = "We've Received Your Message — VeriCert";
  const text = [
    `Hi ${input.toName},`,
    "",
    "Thanks for reaching out to VeriCert. We've received your message and will respond as soon as possible.",
    "",
    "— VeriCert Research",
  ].join("\n");
  await sendMail(input.toEmail, subject, text);
}

// Sent when an executive raises an affiliate to a higher tier (detected by
// comparing tier rank on PATCH) — never sent on a lateral/downward change.
export async function sendAffiliateTierPromotionEmail(
  affiliate: Affiliate,
  newTierLabel: string,
  newCommissionRate: number
): Promise<void> {
  const subject = `You've Been Promoted to ${newTierLabel} — VeriCert Partner Program`;
  const partnerUrl = `${siteUrl()}/partner`;
  const text = [
    `Hi ${affiliate.name},`,
    "",
    `Congratulations — you've been promoted to ${newTierLabel} in the VeriCert Partner Program.`,
    "",
    `Your new commission rate: ${newCommissionRate}% of each qualifying order.`,
    "",
    `Sign in any time at ${partnerUrl} to see your updated rate reflected on your dashboard.`,
    "",
    "— VeriCert Research",
  ].join("\n");

  await sendMailWithHtml(
    affiliate.email,
    subject,
    text,
    `<p>Hi ${affiliate.name},</p>
     <p>Congratulations — you've been promoted to <strong>${newTierLabel}</strong> in the VeriCert Partner Program.</p>
     ${renderCalloutBox("New Commission Rate", `${newCommissionRate}%`)}
     ${renderButton("View Your Dashboard", partnerUrl)}`
  );
}

// Sent whenever a payout is recorded against an affiliate's commission balance.
export async function sendAffiliateCommissionPaidEmail(affiliate: Affiliate, amount: number): Promise<void> {
  const subject = `Commission Paid — $${amount.toFixed(2)}`;
  const partnerUrl = `${siteUrl()}/partner`;
  const text = [
    `Hi ${affiliate.name},`,
    "",
    `A commission payment of $${amount.toFixed(2)} has been recorded to your account.`,
    "",
    `View your full payout history any time at ${partnerUrl}`,
    "",
    "— VeriCert Research",
  ].join("\n");

  await sendMailWithHtml(
    affiliate.email,
    subject,
    text,
    `<p>Hi ${affiliate.name},</p>
     <p>A commission payment has been recorded to your account.</p>
     ${renderCalloutBox("Amount Paid", `$${amount.toFixed(2)}`)}
     ${renderButton("View Payout History", partnerUrl)}`
  );
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

