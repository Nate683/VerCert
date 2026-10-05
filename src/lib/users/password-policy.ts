// The rules for a password a customer chooses, at registration and on reset.
// Shared by the browser (live strength feedback) and the server (the check
// that counts), so the two can't disagree.
//
// Following NIST SP 800-63B: a minimum length and a refusal of known-common
// and context-specific passwords, but no "must contain a symbol" composition
// rules, which push people towards predictable substitutions.

// Keep in step with MIN_LENGTH in scripts/build-common-passwords.mjs.
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export type PasswordContext = { email?: string; firstName?: string; lastName?: string };

export type CommonPasswords = { long: Set<string>; base: Set<string> };

export type PasswordCheck = {
  ok: boolean;
  // Why it's refused, as a sentence to show the user. Set only when !ok.
  problem?: string;
  // 0 = refused, then 1 (weak) to 4 (very strong) for the meter.
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
};

let loading: Promise<CommonPasswords> | null = null;

// The list is ~120 KB, so it's split out and only fetched where a password is
// being chosen.
export function loadCommonPasswords(): Promise<CommonPasswords> {
  loading ??= import("./common-passwords").then((m) => ({
    long: new Set(m.LONG.split("\n")),
    base: new Set(m.BASE_WORDS.split("\n")),
  }));
  return loading;
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };
const unleet = (s: string) => s.replace(/[013457@$!]/g, (c) => LEET[c]);

const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "01234567890", "qwertyuiopasdfghjklzxcvbnm", "1qaz2wsx3edc4rfv5tgb6yhn"];
const isSequence = (s: string) =>
  SEQUENCES.some((seq) => seq.includes(s) || [...seq].reverse().join("").includes(s));

function refuse(problem: string, label: string): PasswordCheck {
  return { ok: false, problem, score: 0, label };
}

// Without `common` (still loading in the browser) the common-password rules
// are skipped; the server always passes it.
export function checkPassword(
  password: string,
  context: PasswordContext = {},
  common: CommonPasswords | null = null
): PasswordCheck {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return refuse(`Use at least ${PASSWORD_MIN_LENGTH} characters.`, "Too short");
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return refuse(`Use ${PASSWORD_MAX_LENGTH} characters or fewer.`, "Too long");
  }

  const lower = password.toLowerCase();
  if (new Set(lower).size < 4 || isSequence(lower)) {
    return refuse("That's too repetitive or predictable. Try a few unrelated words.", "Too predictable");
  }

  if (common) {
    if (common.long.has(lower) || common.long.has(unleet(lower))) {
      return refuse("That's one of the most commonly used passwords. Choose something less predictable.", "Too common");
    }
    // A common word with numbers or symbols around it: "Password2024!", "@sunshine99".
    const core = lower.replace(/[^a-z]+$/, "").replace(/^[^a-z]+/, "");
    if (core.length >= 4 && (common.base.has(core) || common.base.has(unleet(core)))) {
      return refuse("That's a common password with numbers or symbols added. Choose something less predictable.", "Too common");
    }
  }

  // Built around the person's name or email, or this site's name.
  const words = [
    "vericert",
    context.email?.toLowerCase().split("@")[0],
    context.firstName?.toLowerCase(),
    context.lastName?.toLowerCase(),
  ].filter((w): w is string => Boolean(w && w.trim().length >= 3));
  if (words.some((w) => lower.includes(w))) {
    let rest = lower;
    for (const w of words) rest = rest.split(w).join("");
    if (rest.replace(/[^a-z0-9]/g, "").length < 6) {
      return refuse("Don't build your password around your name, email or our site's name.", "Too personal");
    }
  }

  // A rough strength estimate for the meter: length times the size of the
  // character pool, discounted when characters repeat a lot.
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^a-zA-Z\d]/.test(password)) pool += 33;
  const variety = new Set(password).size / password.length;
  const bits = password.length * Math.log2(pool) * Math.min(1, 0.5 + variety);

  if (bits < 45) return { ok: true, score: 1, label: "Weak" };
  if (bits < 60) return { ok: true, score: 2, label: "Fair" };
  if (bits < 80) return { ok: true, score: 3, label: "Strong" };
  return { ok: true, score: 4, label: "Very strong" };
}

// Server-side: the refusal message, or null when the password is acceptable.
export async function passwordProblem(password: string, context: PasswordContext = {}): Promise<string | null> {
  const result = checkPassword(password, context, await loadCommonPasswords());
  return result.ok ? null : (result.problem ?? "Choose a different password.");
}
