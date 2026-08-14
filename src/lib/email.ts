import nodemailer from "nodemailer";
import type { Order } from "@/lib/types";
import { BANK_TRANSFER_DETAILS } from "@/lib/bank-details";

// Sends a transactional email if SMTP env vars are configured, otherwise
// logs it to the console so auth/checkout flows still complete in dev.
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    console.log(
      `[email:dev-fallback] SMTP not configured. Would have sent to ${to}:\nSubject: ${subject}\n\n${text}`
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });

  await transporter.sendMail({ from: EMAIL_FROM || SMTP_USER, to, subject, text });
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
    const d = BANK_TRANSFER_DETAILS;
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
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
