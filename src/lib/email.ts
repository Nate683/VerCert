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

export async function sendBankTransferEmail(order: Order): Promise<void> {
  const subject = `VeriCert Order ${order.reference} — Bank Transfer Instructions`;
  await sendMail(order.customer.email, subject, buildEmailBody(order));
}

function buildEmailBody(order: Order): string {
  const d = BANK_TRANSFER_DETAILS;
  return [
    `Hi ${order.customer.firstName},`,
    "",
    `Thank you for your order. Please complete payment via bank transfer using the details below.`,
    `Your order will remain in "awaiting payment" status until funds are received and confirmed.`,
    "",
    `Order reference: ${order.reference}`,
    `Amount due: $${order.total.toFixed(2)} USD`,
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
    "",
    "For research use only. Not for human or veterinary use.",
    "— VeriCert Research",
  ].join("\n");
}
