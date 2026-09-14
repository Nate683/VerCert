"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useAuth } from "@/lib/auth-context";

const PRIMARY_BUTTON =
  "w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold-ink disabled:opacity-40";
const SECONDARY_BUTTON =
  "border border-control px-4 py-2 text-xs uppercase tracking-[0.15em] text-navy transition-colors hover:border-gold-ink hover:text-gold-ink";

function formatWait(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

// POSTs JSON and throws the API's error message (or `fallback`) on failure.
async function postJson<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After"));
    if (retryAfter > 0) throw new Error(`Too many attempts. Try again in ${formatWait(retryAfter)}.`);
  }
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data as T;
}

// The API has already set the session cookie by the time this runs; it just
// brings the client's auth state up to date and moves on.
function useFinishSignIn(next: string) {
  const router = useRouter();
  const { refresh } = useAuth();
  return async () => {
    await refresh();
    router.push(next);
    router.refresh();
  };
}

function Shell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">{eyebrow}</p>
      <h1 className="mt-3 font-serif text-3xl text-navy">{title}</h1>
      {children}
    </div>
  );
}

function SigningInAs({ email }: { email: string }) {
  return (
    <p className="mt-8 text-center text-xs text-muted">
      Signing in as {email}.{" "}
      <Link href="/login" className="underline-offset-4 hover:text-gold-ink hover:underline">
        Use a different account
      </Link>
    </p>
  );
}

function ErrorNotice({ message, className = "" }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={`border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 ${className}`}>
      {message}
    </p>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      required
      autoFocus
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="000000"
      aria-label="6-digit code"
      className="input-field-light text-center font-mono text-2xl tracking-[0.5em]"
    />
  );
}

type Enrollment = { qrDataUrl: string; manualEntryKey: string };

function Enroll({ email, next }: { email: string; next: string }) {
  const finishSignIn = useFinishSignIn(next);
  const { refresh } = useAuth();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function beginSetup() {
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<{ otpauthUrl: string; manualEntryKey: string }>(
        "/api/auth/two-factor/setup",
        {},
        "Couldn't start setup. Please try again."
      );
      const qrDataUrl = await QRCode.toDataURL(data.otpauthUrl, {
        margin: 1,
        width: 200,
        color: { dark: "#000000", light: "#ffffff" },
      });
      setEnrollment({ qrDataUrl, manualEntryKey: data.manualEntryKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<{ backupCodes: string[] }>(
        "/api/auth/two-factor/enable",
        { code },
        "That code didn't match."
      );
      setBackupCodes(data.backupCodes);
      // Signed in from here on — let the header catch up.
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't match.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function copyCodes(codes: string[]) {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setError("Couldn't copy automatically — select the codes and copy them by hand.");
    }
  }

  function downloadCodes(codes: string[]) {
    const text = `VeriCert backup codes for ${email}\nEach code signs you in once.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "vericert-backup-codes.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  if (backupCodes) {
    return (
      <Shell eyebrow="Two-Factor Enabled" title="Save Your Backup Codes">
        <p className="mt-3 text-sm leading-relaxed text-muted">
          If you lose your phone, each of these codes signs you in once in place of an
          authenticator code. This is the only time they&apos;ll be shown — keep them somewhere
          safe, like a password manager.
        </p>
        <ol className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 border border-hairline bg-surface p-5 font-mono text-sm tracking-wider text-navy">
          {backupCodes.map((c) => (
            <li key={c} className="text-center">
              {c}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex gap-3">
          <button type="button" onClick={() => copyCodes(backupCodes)} className={SECONDARY_BUTTON}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={() => downloadCodes(backupCodes)} className={SECONDARY_BUTTON}>
            Download
          </button>
        </div>
        <ErrorNotice message={error} className="mt-4" />
        <label className="mt-8 flex items-start gap-3 text-sm text-navy">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="mt-0.5 accent-gold"
          />
          I&apos;ve saved these backup codes.
        </label>
        <button
          type="button"
          disabled={!saved || busy}
          onClick={() => {
            setBusy(true);
            void finishSignIn();
          }}
          className={`mt-6 ${PRIMARY_BUTTON}`}
        >
          Continue
        </button>
      </Shell>
    );
  }

  if (enrollment) {
    return (
      <Shell eyebrow="Executive Access" title="Scan the QR Code">
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Open your authenticator app, add a new account, and scan this code.
        </p>
        <div className="mt-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI, not an optimizable asset */}
          <img
            src={enrollment.qrDataUrl}
            alt="QR code that adds VeriCert to your authenticator app"
            width={200}
            height={200}
            className="border border-hairline bg-paper p-2"
          />
        </div>
        <details className="mt-4 text-center text-xs text-muted">
          <summary className="cursor-pointer hover:text-gold-ink">
            Can&apos;t scan it? Enter a setup key instead
          </summary>
          <p className="mt-3 break-all border border-hairline bg-surface p-3 font-mono text-sm tracking-widest text-navy">
            {enrollment.manualEntryKey.match(/.{1,4}/g)?.join(" ")}
          </p>
          <p className="mt-2">Account: {email} · Type: time-based</p>
        </details>
        <form onSubmit={turnOn} className="mt-8 space-y-4">
          <p className="text-sm text-navy">Then enter the 6-digit code the app shows:</p>
          <CodeInput value={code} onChange={setCode} />
          <ErrorNotice message={error} />
          <button type="submit" disabled={busy || code.length !== 6} className={PRIMARY_BUTTON}>
            {busy ? "Verifying..." : "Turn On Two-Factor"}
          </button>
        </form>
        <SigningInAs email={email} />
      </Shell>
    );
  }

  return (
    <Shell eyebrow="Executive Access" title="Set Up Two-Factor Authentication">
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Executive accounts need a second step at sign-in: a 6-digit code from an authenticator
        app on your phone. Setup takes about a minute.
      </p>
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-navy">
        <li>Install Google Authenticator, Authy, or another authenticator app.</li>
        <li>Scan the QR code on the next screen.</li>
        <li>Enter the code it shows, then save your backup codes.</li>
      </ol>
      <ErrorNotice message={error} className="mt-6" />
      <button type="button" onClick={beginSetup} disabled={busy} className={`mt-8 ${PRIMARY_BUTTON}`}>
        {busy ? "Preparing..." : "Begin Setup"}
      </button>
      <SigningInAs email={email} />
    </Shell>
  );
}

function Verify({ email, next }: { email: string; next: string }) {
  const finishSignIn = useFinishSignIn(next);
  const { refresh } = useAuth();
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [backupCodesRemaining, setBackupCodesRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<{ backupCodesRemaining?: number }>(
        "/api/auth/two-factor/verify",
        useBackupCode ? { backupCode } : { code },
        "Incorrect code."
      );
      if (data.backupCodesRemaining !== undefined) {
        // Pause on a spent backup code so the dwindling count gets noticed.
        setBackupCodesRemaining(data.backupCodesRemaining);
        setBusy(false);
        void refresh();
        return;
      }
      await finishSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code.");
      setCode("");
      setBusy(false);
    }
  }

  if (backupCodesRemaining !== null) {
    return (
      <Shell eyebrow="Signed In" title="Backup Code Used">
        <p className="mt-3 text-sm leading-relaxed text-muted">
          That code can&apos;t be used again. You have{" "}
          <span className="font-semibold text-navy">{backupCodesRemaining}</span> backup code
          {backupCodesRemaining === 1 ? "" : "s"} left.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void finishSignIn();
          }}
          className={`mt-8 ${PRIMARY_BUTTON}`}
        >
          Continue
        </button>
      </Shell>
    );
  }

  return (
    <Shell eyebrow="Executive Access" title="Two-Factor Authentication">
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {useBackupCode
          ? "Enter one of the backup codes you saved when you set up two-factor."
          : "Enter the 6-digit code from your authenticator app."}
      </p>
      <form onSubmit={verify} className="mt-8 space-y-4">
        {useBackupCode ? (
          <input
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
            placeholder="XXXXX-XXXXX"
            aria-label="Backup code"
            className="input-field-light text-center font-mono text-lg tracking-[0.3em]"
          />
        ) : (
          <CodeInput value={code} onChange={setCode} />
        )}
        <ErrorNotice message={error} />
        <button
          type="submit"
          disabled={busy || (useBackupCode ? !backupCode.trim() : code.length !== 6)}
          className={PRIMARY_BUTTON}
        >
          {busy ? "Verifying..." : "Verify"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setUseBackupCode((v) => !v);
          setError(null);
        }}
        className="mt-4 text-center text-xs text-muted hover:text-gold-ink"
      >
        {useBackupCode ? "Use your authenticator app instead" : "Lost your phone? Use a backup code"}
      </button>
      <SigningInAs email={email} />
    </Shell>
  );
}

export default function TwoFactorClient({
  mode,
  email,
  next,
}: {
  mode: "enroll" | "verify";
  email: string;
  next: string;
}) {
  return mode === "enroll" ? <Enroll email={email} next={next} /> : <Verify email={email} next={next} />;
}
