"use client";

import { useEffect, useRef, useState } from "react";
import {
  checkPassword,
  loadCommonPasswords,
  PASSWORD_MIN_LENGTH,
  type CommonPasswords,
  type PasswordContext,
} from "@/lib/users/password-policy";

// A new-password input with live strength feedback. A refused password marks
// the input invalid, so the browser won't submit the form; the server runs
// the same check regardless.
export function PasswordField({
  id,
  value,
  onChange,
  context,
  placeholder = "Password",
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  context?: PasswordContext;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [common, setCommon] = useState<CommonPasswords | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCommonPasswords()
      .then((lists) => {
        if (!cancelled) setCommon(lists);
      })
      .catch(() => {
        // The server still checks; the meter just can't flag common passwords.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const result = value ? checkPassword(value, context, common) : null;
  const problem = result && !result.ok ? (result.problem ?? "Choose a different password.") : "";

  useEffect(() => {
    inputRef.current?.setCustomValidity(problem);
  }, [problem]);

  const tone = !result ? "" : result.score <= 1 ? "text-red-700" : "text-gold-ink";
  const fill = !result || result.score <= 1 ? "bg-red-700" : "bg-gold";

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        required
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-describedby={`${id}-strength`}
        autoComplete="new-password"
        autoFocus={autoFocus}
        className="input-field-light"
      />
      <div id={`${id}-strength`} aria-live="polite" className="mt-2">
        <div className="flex gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={`h-1 flex-1 ${result && (result.score >= step || (result.score === 0 && step === 1)) ? fill : "bg-control"}`}
            />
          ))}
        </div>
        <p className={`mt-1.5 text-xs leading-relaxed ${result ? tone : "text-muted"}`}>
          {!result
            ? `At least ${PASSWORD_MIN_LENGTH} characters. A few unrelated words make a strong, memorable password.`
            : result.ok
              ? `Strength: ${result.label}${result.score <= 2 ? " — longer is stronger." : ""}`
              : `${result.label}: ${result.problem}`}
        </p>
      </div>
    </div>
  );
}
