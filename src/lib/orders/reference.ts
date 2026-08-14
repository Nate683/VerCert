import { randomBytes } from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid ambiguity

// Short human-friendly reference customers can quote in bank transfers, e.g. VC-7F3K9Q.
export function generateOrderReference(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return `VC-${code}`;
}
