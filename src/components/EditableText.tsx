"use client";

import { useEffect, useState } from "react";
import { useExecMode } from "@/lib/exec-mode-context";

type Props = {
  value: string;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  multiline?: boolean;
  // Either provide onSave directly (when the caller is already a client
  // component), or contentKey+field to auto-PATCH that site_content field.
  onSave?: (newValue: string) => Promise<void> | void;
  contentKey?: string;
  field?: string;
};

async function defaultSave(contentKey: string, field: string, newValue: string) {
  const res = await fetch("/api/executive/inline-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: contentKey, patch: { [field]: newValue } }),
  });
  if (!res.ok) throw new Error("Failed to save.");
}

// Live Edit Mode's click-to-edit text field. Renders as plain static text
// (identical to the customer view) whenever exec mode is off.
export function EditableText({ value, as = "span", className, multiline, onSave, contentKey, field }: Props) {
  const { execMode, beginSave, endSave } = useExecMode();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync local draft when the underlying content changes externally (e.g. after another edit saves and the page revalidates)
    setDraft(value);
  }, [value]);

  const Tag = as;

  if (!execMode) {
    return <Tag className={className}>{value}</Tag>;
  }

  async function save() {
    setEditing(false);
    if (draft === value) return;
    beginSave();
    try {
      if (onSave) await onSave(draft);
      else if (contentKey && field) await defaultSave(contentKey, field, draft);
      endSave(true);
    } catch {
      endSave(false);
    }
  }

  if (editing) {
    return multiline ? (
      <textarea
        autoFocus
        value={draft}
        rows={3}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`${className ?? ""} w-full border border-gold bg-black/90 px-2 py-1 text-white outline-none`}
      />
    ) : (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`${className ?? ""} w-full border border-gold bg-black/90 px-2 py-1 text-white outline-none`}
      />
    );
  }

  return (
    <Tag
      onClick={() => setEditing(true)}
      className={`${className ?? ""} cursor-text outline-dashed outline-1 outline-transparent transition-colors hover:outline-gold/60`}
    >
      {value}
    </Tag>
  );
}
