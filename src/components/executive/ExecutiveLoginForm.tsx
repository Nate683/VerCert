"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ExecutiveLoginForm({
  realm,
  terminalName,
  variant,
}: {
  realm: "command" | "office";
  terminalName: string;
  variant: "command" | "office";
}) {
  const router = useRouter();
  const isCommand = variant === "command";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/executive/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ realm, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Incorrect password.");
      router.push(`/${realm}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect password.");
      setSubmitting(false);
    }
  }

  return (
    <div className={isCommand ? "command-grain flex min-h-screen items-center justify-center bg-black px-6" : "flex min-h-screen items-center justify-center bg-black px-6"}>
      <div className="relative z-10 w-full max-w-sm">
        <p className="text-center text-[11px] uppercase tracking-[0.35em] text-gold">
          {terminalName}
        </p>
        <h1 className={isCommand ? "mt-3 text-center font-serif text-3xl text-white" : "mt-3 text-center text-2xl font-semibold text-white"}>
          Sign In
        </h1>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="input-field"
          />
          {error && (
            <p className="border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className={
              isCommand
                ? "w-full border border-gold py-3 text-sm uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
                : "w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
            }
          >
            {submitting ? "Signing In..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
