"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HqMember } from "@/lib/hq";
import type { HqMessage } from "@/lib/types";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";

type Conversation = { channel: string; otherId: string; otherName: string };

// "general" or a specific DM partner.
type ActiveThread = { kind: "general" } | { kind: "dm"; memberId: string; memberName: string };

export function ChatPanel({ member }: { member: HqMember }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [members, setMembers] = useState<HqMember[]>([]);
  const [active, setActive] = useState<ActiveThread>({ kind: "general" });
  const [messages, setMessages] = useState<HqMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showThreadOnMobile, setShowThreadOnMobile] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadSidebar = useCallback(async () => {
    const [convRes, membersRes] = await Promise.all([
      fetch("/api/hq/conversations", { cache: "no-store" }),
      fetch("/api/hq/members", { cache: "no-store" }),
    ]);
    if (convRes.ok) setConversations((await convRes.json()).conversations ?? []);
    if (membersRes.ok) setMembers((await membersRes.json()).members ?? []);
  }, []);

  const loadMessages = useCallback(async () => {
    const params = active.kind === "dm" ? `withMemberId=${active.memberId}` : "channel=general";
    const res = await fetch(`/api/hq/messages?${params}`, { cache: "no-store" });
    if (res.ok) setMessages((await res.json()).messages ?? []);
  }, [active]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    loadSidebar();
  }, [loadSidebar]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when the active thread changes
    loadMessages();
  }, [loadMessages]);

  useLiveRefresh(loadMessages, 3500);
  useLiveRefresh(loadSidebar, 8000);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await fetch("/api/hq/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          active.kind === "dm" ? { toMemberId: active.memberId, body: text } : { channel: "general", body: text }
        ),
      });
      setText("");
      await Promise.all([loadMessages(), loadSidebar()]);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/hq/messages/${id}`, { method: "DELETE" });
    await loadMessages();
  }

  function openThread(thread: ActiveThread) {
    setActive(thread);
    setShowPicker(false);
    setShowThreadOnMobile(true);
  }

  const threadLabel = active.kind === "general" ? "General" : active.memberName;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className={`space-y-1 lg:block ${showThreadOnMobile ? "hidden" : "block"}`}>
        <button
          type="button"
          onClick={() => openThread({ kind: "general" })}
          className={`w-full border px-4 py-3 text-left text-sm transition-colors ${
            active.kind === "general" ? "border-gold text-gold" : "border-white/10 text-white/70 hover:border-white/30"
          }`}
        >
          # General
        </button>

        <p className="pt-4 text-[10px] uppercase tracking-[0.15em] text-white/30">Direct Messages</p>
        {conversations.map((c) => (
          <button
            key={c.channel}
            type="button"
            onClick={() => openThread({ kind: "dm", memberId: c.otherId, memberName: c.otherName })}
            className={`w-full border px-4 py-3 text-left text-sm transition-colors ${
              active.kind === "dm" && active.memberId === c.otherId
                ? "border-gold text-gold"
                : "border-white/10 text-white/70 hover:border-white/30"
            }`}
          >
            {c.otherName}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          className="mt-2 w-full border border-dashed border-white/20 px-4 py-3 text-left text-xs uppercase tracking-[0.1em] text-white/40 hover:border-gold hover:text-gold"
        >
          + New Message
        </button>
        {showPicker && (
          <div className="max-h-64 overflow-y-auto border border-white/10 bg-white/[0.02]">
            {members
              .filter((m) => !conversations.some((c) => c.otherId === m.id))
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openThread({ kind: "dm", memberId: m.id, memberName: m.name })}
                  className="block w-full px-4 py-2.5 text-left text-sm text-white/70 hover:bg-white/5 hover:text-gold"
                >
                  {m.name}
                  <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-white/30">{m.kind}</span>
                </button>
              ))}
            {members.filter((m) => !conversations.some((c) => c.otherId === m.id)).length === 0 && (
              <p className="px-4 py-3 text-xs text-white/30">No one else to message yet.</p>
            )}
          </div>
        )}
      </div>

      <div className={`flex min-h-[60vh] flex-col border border-white/10 lg:flex ${showThreadOnMobile ? "flex" : "hidden"}`}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => setShowThreadOnMobile(false)}
            className="text-white/40 hover:text-gold lg:hidden"
          >
            ← Back
          </button>
          <p className="text-sm uppercase tracking-[0.15em] text-gold">{threadLabel}</p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <p className="text-sm text-white/30">No messages yet.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.senderId === member.id ? "justify-end" : "justify-start"}`}>
                <div
                  className={`group max-w-[80%] border px-3 py-2 text-sm ${
                    m.senderId === member.id ? "border-gold/40 bg-gold/5 text-white" : "border-white/10 text-white/80"
                  }`}
                >
                  {m.senderId !== member.id && (
                    <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">{m.senderName}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="text-[10px] text-white/30">{new Date(m.createdAt).toLocaleTimeString()}</p>
                    {(m.senderId === member.id || member.kind === "executive") && (
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id)}
                        className="text-[10px] text-white/20 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="flex gap-2 border-t border-white/10 p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message..."
            className="input-field"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="border border-gold bg-gold px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
