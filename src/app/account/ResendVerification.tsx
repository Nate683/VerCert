"use client";

import { useState } from "react";

export function ResendVerification() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function handleClick() {
    setStatus("sending");
    await fetch("/api/auth/resend-verification", { method: "POST" });
    setStatus("sent");
  }

  if (status === "sent") {
    return <p className="text-xs text-gold">Verification email sent — check your inbox.</p>;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "sending"}
      className="text-xs uppercase tracking-[0.15em] text-gold underline-offset-4 hover:underline disabled:opacity-40"
    >
      {status === "sending" ? "Sending..." : "Resend verification email"}
    </button>
  );
}
