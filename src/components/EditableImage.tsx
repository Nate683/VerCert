"use client";

import { useRef, useState } from "react";
import { useExecMode } from "@/lib/exec-mode-context";

type Props = {
  children: React.ReactNode;
  uploadEndpoint?: string;
  onReplace?: (url: string) => Promise<void> | void;
  contentKey?: string;
  field?: string;
};

async function defaultSave(contentKey: string, field: string, url: string) {
  const res = await fetch("/api/executive/inline-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: contentKey, patch: { [field]: url } }),
  });
  if (!res.ok) throw new Error("Failed to save.");
}

// Live Edit Mode's click-to-replace image wrapper. Renders children exactly
// as-is (no overlay) whenever exec mode is off.
export function EditableImage({ children, uploadEndpoint, onReplace, contentKey, field }: Props) {
  const { execMode, beginSave, endSave } = useExecMode();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  if (!execMode) return <>{children}</>;

  async function handleFile(file: File) {
    setUploading(true);
    beginSave();
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(uploadEndpoint ?? "/api/executive/content/upload-image", {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      if (onReplace) await onReplace(data.url);
      else if (contentKey && field) await defaultSave(contentKey, field, data.url);
      endSave(true);
    } catch {
      endSave(false);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="group/editable relative">
      {children}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent transition-colors group-hover/editable:bg-black/50 group-hover/editable:text-white"
      >
        <span className="border border-gold px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-gold">
          {uploading ? "Uploading..." : "Replace Image"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
