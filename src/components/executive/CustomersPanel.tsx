"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { CustomerSummary } from "@/lib/executive/customers";
import type { MessageTemplate } from "@/lib/types";
import { LiveIndicator } from "./LiveIndicator";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";

export function CustomersPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"all-optin" | "all-affiliates" | "selected">("all-optin");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const load = useCallback(() => {
    return fetch("/api/executive/customers", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setCustomers(data.customers ?? []))
      .finally(() => setLoading(false));
  }, []);

  const loadTemplates = useCallback(() => {
    return fetch("/api/executive/templates", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
    loadTemplates();
  }, [load, loadTemplates]);

  useLiveRefresh(load, 20000, Boolean(expandedId) || sending);

  function toggleExpanded(c: CustomerSummary) {
    if (expandedId === c.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(c.id);
    setNotesDraft(c.notes ?? "");
  }

  async function handleSaveNotes(id: string) {
    setNotesSaving(true);
    try {
      await fetch(`/api/executive/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, notes: notesDraft } : c)));
    } finally {
      setNotesSaving(false);
    }
  }

  function toggleSelected(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const recipients = mode === "selected" ? Array.from(selected) : mode;
      const res = await fetch(channel === "email" ? "/api/executive/email/send" : "/api/executive/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          channel === "email" ? { recipients, subject, body } : { recipients, body }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send.");
      setResult(`Sent to ${data.sent} recipient(s).`);
      setSubject("");
      setBody("");
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveTemplate() {
    if (!templateName.trim() || !body.trim()) return;
    setSavingTemplate(true);
    try {
      await fetch("/api/executive/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: templateName, channel, subject: channel === "email" ? subject : undefined, body }),
      });
      setTemplateName("");
      await loadTemplates();
    } finally {
      setSavingTemplate(false);
    }
  }

  function handleLoadTemplate(id: string) {
    const t = templates.find((tpl) => tpl.id === id);
    if (!t) return;
    setChannel(t.channel);
    setSubject(t.subject ?? "");
    setBody(t.body);
  }

  async function handleDeleteTemplate(id: string) {
    await fetch(`/api/executive/templates/${id}`, { method: "DELETE" });
    await loadTemplates();
  }

  const cardClass = isCommand
    ? "command-panel p-6"
    : "office-card";
  const optedInCount = customers.filter((c) => c.marketingOptIn).length;

  return (
    <div className="space-y-8">
      <LiveIndicator variant={variant} />
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
            Customers ({customers.length})
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page route */}
          <a
            href="/api/executive/customers?format=csv"
            className="border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.1em] text-white/70 transition-colors hover:border-gold hover:text-gold"
          >
            Export CSV
          </a>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
                <th className="w-8 pb-3" />
                <th className="pb-3 pr-4 font-normal">Email</th>
                <th className="pb-3 pr-4 font-normal">Signup Date</th>
                <th className="pb-3 pr-4 font-normal">Orders</th>
                <th className="pb-3 pr-4 font-normal">Lifetime Value</th>
                <th className="pb-3 font-normal">Marketing</th>
              </tr>
            </thead>
            <tbody>
              {loading && customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-white/30">
                    Loading...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-white/30">
                    No customers yet.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="border-b border-white/5 text-white/80">
                      <td className="py-3">
                        <input
                          type="checkbox"
                          disabled={!c.marketingOptIn}
                          checked={selected.has(c.email)}
                          onChange={() => toggleSelected(c.email)}
                          className="h-4 w-4 accent-[#c9a227] disabled:opacity-20"
                        />
                      </td>
                      <td className="py-3 pr-4 text-white">
                        <button type="button" onClick={() => toggleExpanded(c)} className="hover:text-gold">
                          {c.email}
                        </button>
                      </td>
                      <td className="py-3 pr-4 text-xs text-white/50">
                        {new Date(c.signupDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">{c.orderCount}</td>
                      <td className={isCommand ? "py-3 pr-4 font-mono" : "py-3 pr-4"}>
                        ${c.lifetimeValue.toFixed(2)}
                      </td>
                      <td className="py-3 text-xs">
                        {c.marketingOptIn ? (
                          <span className="text-gold">Opted In</span>
                        ) : (
                          <span className="text-white/30">Opted Out</span>
                        )}
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <td colSpan={6} className="p-4">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">Recent Orders</p>
                              {c.recentOrders.length === 0 ? (
                                <p className="mt-2 text-xs text-white/30">No orders yet.</p>
                              ) : (
                                <ul className="mt-2 space-y-1 text-xs text-white/70">
                                  {c.recentOrders.map((o) => (
                                    <li key={o.reference} className="flex justify-between">
                                      <span>{o.reference} — {o.status.replace("_", " ")}</span>
                                      <span>${o.total.toFixed(2)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">Notes</p>
                              <textarea
                                value={notesDraft}
                                onChange={(e) => setNotesDraft(e.target.value)}
                                rows={3}
                                placeholder="Internal notes about this customer..."
                                className="input-field mt-2 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveNotes(c.id)}
                                disabled={notesSaving}
                                className="mt-2 border border-gold px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-gold hover:bg-gold hover:text-black disabled:opacity-40"
                              >
                                {notesSaving ? "Saving..." : "Save Notes"}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={cardClass}>
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Compose {channel === "email" ? "Email" : "SMS"}</p>
        <form onSubmit={handleSend} className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-white/70">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={channel === "email"}
                onChange={() => setChannel("email")}
                className="h-4 w-4 accent-[#c9a227]"
              />
              Email
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={channel === "sms"}
                onChange={() => setChannel("sms")}
                className="h-4 w-4 accent-[#c9a227]"
              />
              SMS
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-white/70">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "all-optin"}
                onChange={() => setMode("all-optin")}
                className="h-4 w-4 accent-[#c9a227]"
              />
              All opted-in customers ({optedInCount})
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "all-affiliates"}
                onChange={() => setMode("all-affiliates")}
                className="h-4 w-4 accent-[#c9a227]"
              />
              All affiliates
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "selected"}
                onChange={() => setMode("selected")}
                className="h-4 w-4 accent-[#c9a227]"
              />
              Selected only ({selected.size})
            </label>
          </div>
          {templates.filter((t) => t.channel === channel).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                onChange={(e) => e.target.value && handleLoadTemplate(e.target.value)}
                defaultValue=""
                className="input-field w-auto"
              >
                <option value="" disabled>
                  Load a saved template...
                </option>
                {templates
                  .filter((t) => t.channel === channel)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {channel === "email" && (
            <input
              required
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="input-field"
            />
          )}
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message"
            rows={6}
            className="input-field resize-none"
          />
          <p className="text-xs text-white/30">
            {channel === "email"
              ? "An unsubscribe link is automatically appended. Only opted-in customers ever receive these emails."
              : "STOP instructions are automatically appended. Only customers/affiliates who explicitly opted in with a phone number ever receive these texts."}
          </p>
          {result && <p className="text-sm text-gold">{result}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={sending || (mode === "selected" && selected.size === 0)}
              className="border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
            >
              {sending ? "Sending..." : `Send ${channel === "email" ? "Email" : "SMS"}`}
            </button>
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              className="input-field w-auto"
            />
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={savingTemplate || !templateName.trim() || !body.trim()}
              className="border border-white/15 px-4 py-2.5 text-xs uppercase tracking-[0.1em] text-white/70 transition-colors hover:border-gold hover:text-gold disabled:opacity-40"
            >
              Save as Template
            </button>
          </div>
          {templates.filter((t) => t.channel === channel).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {templates
                .filter((t) => t.channel === channel)
                .map((t) => (
                  <span
                    key={t.id}
                    className="flex items-center gap-2 border border-white/10 px-3 py-1.5 text-xs text-white/50"
                  >
                    {t.name}
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(t.id)}
                      className="text-white/30 hover:text-red-300"
                    >
                      ×
                    </button>
                  </span>
                ))}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
