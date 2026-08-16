"use client";

import { useCallback, useEffect, useState } from "react";
import type { HqMember } from "@/lib/hq";
import type { HqResource } from "@/lib/types";

export function ResourcesPanel({ member }: { member: HqMember }) {
  const isExecutive = member.kind === "executive";
  const [resources, setResources] = useState<HqResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/hq/resources", { cache: "no-store" });
    if (res.ok) setResources((await res.json()).resources ?? []);
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
      formData.set("title", title);
      formData.set("description", description);
      const res = await fetch("/api/hq/resources", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not upload file.");
      setTitle("");
      setDescription("");
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this resource?")) return;
    await fetch(`/api/hq/resources/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {isExecutive && (
        <form onSubmit={handleUpload} className="border border-gold/20 bg-white/[0.02] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Upload Resource</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="input-field"
            />
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="input-field file:mr-3 file:border-0 file:bg-gold file:px-3 file:py-1.5 file:text-xs file:uppercase file:text-black"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="input-field sm:col-span-2"
            />
          </div>
          {error && <p className="mt-3 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={uploading || !file}
            className="mt-4 border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="text-sm text-white/30">Loading...</p>
        ) : resources.length === 0 ? (
          <p className="text-sm text-white/30">No resources yet.</p>
        ) : (
          resources.map((r) => (
            <div key={r.id} className="flex flex-col border border-white/10 bg-white/[0.02] p-5">
              <p className="text-white">{r.title}</p>
              {r.description && <p className="mt-1 text-xs text-white/50">{r.description}</p>}
              <p className="mt-2 text-[10px] uppercase tracking-[0.1em] text-white/30">
                {r.uploadedBy ?? "Unknown"} · {new Date(r.createdAt).toLocaleDateString()}
              </p>
              <div className="mt-4 flex gap-2">
                <a
                  href={r.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 border border-gold px-3 py-2 text-center text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black"
                >
                  Download
                </a>
                {isExecutive && (
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
                    className="border border-red-500/30 px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:border-red-400"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
