// Generic HMAC-signed, expiring token helper built on Web Crypto (works in
// both the Node and Edge runtimes) — used for session cookies and signed
// links (e.g. unsubscribe) throughout the app.
const encoder = new TextEncoder();

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function signValue(secret: string, value: string): Promise<string> {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toHex(signature);
}

export async function verifySignature(
  secret: string,
  value: string,
  signatureHex: string
): Promise<boolean> {
  try {
    const key = await getHmacKey(secret);
    return await crypto.subtle.verify("HMAC", key, fromHex(signatureHex), encoder.encode(value));
  } catch {
    return false;
  }
}

// Creates a token of the form `<payload>.<expiresAt>.<signature>`.
export async function createExpiringToken(
  secret: string,
  payload: string,
  ttlMs: number
): Promise<string> {
  const expiresAt = Date.now() + ttlMs;
  const signed = `${payload}.${expiresAt}`;
  const signature = await signValue(secret, signed);
  return `${signed}.${signature}`;
}

// Verifies and returns the payload, or null if invalid/expired.
export async function verifyExpiringToken(
  secret: string,
  token: string | undefined
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [payload, expiresAtRaw, signatureHex] = parts;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const valid = await verifySignature(secret, `${payload}.${expiresAtRaw}`, signatureHex);
  return valid ? payload : null;
}
