"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "What's our revenue this month?",
  "Which products are low on stock?",
  "How many orders are awaiting payment?",
];

export function AssistantChat({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(q: string) {
    if (!q.trim() || loading) return;
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await fetch("/api/executive/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      const text = res.ok ? data.answer : (data.error ?? "The assistant is unavailable.");
      setMessages((prev) => [...prev, { role: "assistant", text }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "The assistant is unavailable right now." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const cardClass = isCommand
    ? "command-panel p-6"
    : "office-card";

  return (
    <div className={cardClass}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Assistant</p>
      <p className="mt-1 text-xs text-white/40">
        Ask about orders, revenue, inventory, or customers.
      </p>

      {messages.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="border border-white/15 px-3 py-1.5 text-xs text-white/60 transition-colors hover:border-gold hover:text-gold"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 max-h-96 space-y-4 overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "ml-auto max-w-[85%] text-right" : "mr-auto max-w-[85%]"}
          >
            <p
              className={`inline-block border px-4 py-2.5 text-left text-sm ${
                m.role === "user"
                  ? "border-gold/40 bg-gold/5 text-white"
                  : "border-white/15 text-white/80"
              }`}
            >
              {m.text}
            </p>
          </div>
        ))}
        {loading && <p className="text-xs text-white/30">Thinking...</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about the store..."
          className="input-field"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 border border-gold px-5 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
