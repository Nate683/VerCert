"use client";

import { useState } from "react";
import { ConfirmPasswordField, PasswordField } from "@/components/PasswordField";

// Account Settings → Change Password. All three fields show from the start.
// The new password gets the same live strength rules as registration
// (PasswordField), and the confirmation must match (ConfirmPasswordField);
// both only guard against typos. The server re-checks the current password
// and the rules, and signs out every other session (api/account/password).
// Nothing typed here is stored anywhere in the browser.
export function PasswordChangeForm({ email, firstName, lastName }: { email: string; firstName?: string; lastName?: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (!confirmPassword || confirmPassword !== newPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Your password couldn't be changed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // An executive session isn't re-issued here: sign in again (full page load).
      if (data.signedOut) {
        window.location.assign(data.next ?? "/executive");
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your password couldn't be changed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <input
        id="account-current-password"
        type="password"
        required
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder="Current password"
        aria-label="Current password"
        autoComplete="current-password"
        className="input-field-light"
      />
      <PasswordField
        id="account-new-password"
        value={newPassword}
        onChange={setNewPassword}
        context={{ email, firstName, lastName }}
        placeholder="New password"
      />
      <ConfirmPasswordField
        id="account-new-password-confirm"
        value={confirmPassword}
        onChange={setConfirmPassword}
        password={newPassword}
        placeholder="Confirm new password"
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm text-gold-ink">
          Password updated. You&apos;ve been signed out everywhere else.
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="border border-hairline px-6 py-2 text-xs uppercase tracking-[0.15em] text-navy transition-colors hover:border-gold hover:text-gold-ink disabled:opacity-40"
      >
        {saving ? "Updating..." : "Update Password"}
      </button>
    </form>
  );
}
