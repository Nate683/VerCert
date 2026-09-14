import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// RFC 6238 TOTP with the parameters every authenticator app (Google
// Authenticator, Authy, 1Password, ...) supports: HMAC-SHA1, 6 digits,
// 30-second steps. Pure functions only — storage, encryption and replay
// tracking live in store.ts.
const STEP_SECONDS = 30;
const DIGITS = 6;
const CODE_PATTERN = new RegExp(`^\\d{${DIGITS}}$`);
// Also accept the codes either side of the current one, so a phone clock
// that's off by up to ~30 seconds still works.
const DRIFT_STEPS = 1;
const SECRET_BYTES = 20; // 160 bits, as RFC 4226 recommends
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): Buffer {
  return randomBytes(SECRET_BYTES);
}

// Unpadded RFC 4648 base32 — what authenticator apps expect in an otpauth://
// URI and when a key is typed in by hand.
export function toBase32(bytes: Buffer): string {
  let out = "";
  let value = 0;
  let bits = 0;
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function buildOtpauthUrl(secret: Buffer, accountName: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret: toBase32(secret),
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// RFC 4226 HOTP: HMAC the counter, then dynamically truncate to DIGITS.
function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

// Returns the time step `code` was generated for, or null if it matches none
// in the drift window. Callers must remember the step and refuse it (and any
// earlier one) afterwards — a code is good for one use (RFC 6238 §5.2).
export function matchTotpStep(secret: Buffer, code: string, timeMs = Date.now()): number | null {
  const candidate = code.replace(/\s/g, "");
  if (!CODE_PATTERN.test(candidate)) return null;
  const candidateBytes = Buffer.from(candidate);
  const current = Math.floor(timeMs / 1000 / STEP_SECONDS);
  let matched: number | null = null;
  // No early return, so response time doesn't reveal which step matched.
  for (let step = Math.max(0, current - DRIFT_STEPS); step <= current + DRIFT_STEPS; step++) {
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), candidateBytes) && matched === null) {
      matched = step;
    }
  }
  return matched;
}
