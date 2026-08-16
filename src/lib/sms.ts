// Server-only Twilio SMS sender via direct REST calls (no SDK dependency).
// Falls back to a console log if Twilio env vars aren't configured, so
// order/affiliate flows still complete end-to-end in dev. Every message
// must end with STOP instructions, and callers must only pass phone numbers
// for users who have explicitly opted in (see users.sms_opt_in) — this
// module does not itself check opt-in; call sites are responsible.
const STOP_SUFFIX = " Reply STOP to unsubscribe.";

export async function sendSms(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const fullBody = body.endsWith("STOP to unsubscribe.") ? body : `${body}${STOP_SUFFIX}`;

  if (!accountSid || !authToken || !from) {
    console.log(`[sms:dev-fallback] Twilio not configured. Would have texted ${to}:\n${fullBody}`);
    return;
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: fullBody }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio API error (${res.status}): ${text}`);
  }
}

export async function sendOrderShippedSms(phone: string, reference: string): Promise<void> {
  await sendSms(phone, `VeriCert: Order ${reference} has shipped.`);
}

export async function sendPaymentReceivedSms(phone: string, reference: string, amount: number): Promise<void> {
  await sendSms(phone, `VeriCert: Payment received for order ${reference} ($${amount.toFixed(2)}).`);
}

export async function sendCommissionPaidSms(phone: string, amount: number): Promise<void> {
  await sendSms(phone, `VeriCert: A commission payment of $${amount.toFixed(2)} has been sent to you.`);
}
