"use client";

import { useCallback, useEffect, useState } from "react";
import type { CompanyDocument } from "@/lib/types";

const CATEGORIES = ["Contract", "COA", "License", "Formation Doc", "Other"];

export function DocumentsPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/executive/documents", { cache: "no-store" });
    if (res.ok) setDocuments((await res.json()).documents ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("name", name || file.name);
      formData.set("category", category);
      const res = await fetch("/api/executive/documents", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      setName("");
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this document?")) return;
    await fetch(`/api/executive/documents/${id}`, { method: "DELETE" });
    await load();
  }

  const cardClass = isCommand ? "command-panel p-6" : "office-card";

  if (loading) return <p className="text-sm text-white/30">Loading...</p>;

  return (
    <div className="space-y-6">
      <form onSubmit={handleUpload} className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Upload Document</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Document name"
            className="input-field"
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            required
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="input-field file:mr-3 file:border-0 file:bg-gold file:px-3 file:py-1.5 file:text-xs file:uppercase file:text-black"
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={uploading || !file}
          className="mt-4 border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Documents ({documents.length})</p>
        {documents.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">No documents uploaded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 text-sm">
                <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-white/80 hover:text-gold">
                  {d.name}
                </a>
                <span className="flex items-center gap-3 text-xs text-white/40">
                  <span className="uppercase tracking-[0.1em]">{d.category}</span>
                  <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                  <button type="button" onClick={() => handleDelete(d.id)} className="text-white/30 hover:text-red-300">
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
