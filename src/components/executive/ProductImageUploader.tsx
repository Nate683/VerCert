"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  checkProductImageFile,
  incomingImagePrefix,
  PRODUCT_IMAGE_ALLOWED_LABEL,
  PRODUCT_IMAGE_MAX_EDGE,
  PRODUCT_IMAGE_TYPES,
} from "@/lib/products/image-rules";

type Stage =
  | { kind: "idle" }
  | { kind: "selected"; file: File; previewUrl: string }
  | { kind: "uploading"; file: File; previewUrl: string; loaded: number; total: number; startedAt: number }
  | { kind: "processing"; file: File; previewUrl: string; startedAt: number }
  | { kind: "confirm-remove" }
  | { kind: "removing" };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const ACCEPT = Object.keys(PRODUCT_IMAGE_TYPES).join(",");

// The product photo panel on the product edit screen. The original goes from
// the browser straight to Blob (with real progress), then the server resizes,
// strips metadata and stores the processed copy, and deletes the original and
// the photo it replaced. Previews use the storefront's framing — a light
// square, contained and padded — so what's shown here is what the tile shows.
export function ProductImageUploader({
  slug,
  name,
  currentUrl,
  onSaved,
}: {
  slug: string;
  name: string;
  currentUrl?: string;
  onSaved: () => Promise<void> | void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const previewUrl = "previewUrl" in stage ? stage.previewUrl : null;
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const busy = stage.kind === "uploading" || stage.kind === "processing" || stage.kind === "removing";

  // Progress events arrive whenever the browser sends another piece, which on
  // a poor connection can be seconds apart. A ticking clock keeps the panel
  // visibly alive in between, so a slow upload never looks frozen.
  const [now, setNow] = useState(() => Date.now());
  const inFlight = stage.kind === "uploading" || stage.kind === "processing";
  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [inFlight]);
  const elapsed = "startedAt" in stage ? Math.max(0, Math.round((now - stage.startedAt) / 1000)) : 0;

  function pick(file: File | undefined) {
    if (!file || busy) return;
    const problem = checkProductImageFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStage({ kind: "selected", file, previewUrl: URL.createObjectURL(file) });
  }

  async function save() {
    if (stage.kind !== "selected") return;
    const { file, previewUrl: preview } = stage;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    const startedAt = Date.now();
    setNow(startedAt);
    setStage({ kind: "uploading", file, previewUrl: preview, loaded: 0, total: file.size, startedAt });
    try {
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-80);
      const blob = await upload(`${incomingImagePrefix(slug)}${safeName}`, file, {
        access: "public",
        handleUploadUrl: `/api/executive/products/${slug}/image/upload`,
        contentType: file.type,
        abortSignal: controller.signal,
        onUploadProgress: ({ loaded, total }) =>
          setStage((s) => (s.kind === "uploading" ? { ...s, loaded, total: total || s.total } : s)),
      });

      setStage({ kind: "processing", file, previewUrl: preview, startedAt });
      const res = await fetch(`/api/executive/products/${slug}/image`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadUrl: blob.url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The image couldn't be saved.");
      await onSaved();
      setStage({ kind: "idle" });
    } catch (err) {
      if (controller.signal.aborted) {
        setStage({ kind: "selected", file, previewUrl: URL.createObjectURL(file) });
        return;
      }
      setError(err instanceof Error ? err.message : "The image couldn't be saved.");
      setStage({ kind: "selected", file, previewUrl: URL.createObjectURL(file) });
    } finally {
      abortRef.current = null;
    }
  }

  async function remove() {
    setStage({ kind: "removing" });
    setError(null);
    try {
      const res = await fetch(`/api/executive/products/${slug}/image`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "The image couldn't be removed.");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The image couldn't be removed.");
    } finally {
      setStage({ kind: "idle" });
    }
  }

  const shown = previewUrl ?? currentUrl;
  const pct = stage.kind === "uploading" && stage.total ? Math.round((stage.loaded / stage.total) * 100) : 0;

  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-white/40">Product image</p>
      <div className="flex flex-wrap items-start gap-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`relative aspect-square w-44 shrink-0 overflow-hidden border ${
            dragging ? "border-gold ring-2 ring-gold" : shown ? "border-white/20" : "border-dashed border-white/25"
          } ${shown ? "bg-paper" : "bg-black/30"}`}
        >
          {shown ? (
            // A plain <img>: the preview is a local object URL, which next/image can't load.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown}
              alt={previewUrl ? `Selected image for ${name}` : `Current image for ${name}`}
              width={176}
              height={176}
              className={`h-full w-full object-contain p-[10%] ${busy ? "opacity-60" : ""}`}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-[10px] uppercase tracking-[0.12em] text-white/40">
              <span>Drop image here</span>
              <span className="normal-case tracking-normal text-white/30">or use Choose file</span>
            </div>
          )}
          {previewUrl && stage.kind === "selected" && (
            <span className="absolute left-1.5 top-1.5 bg-black/75 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-gold">
              Not saved
            </span>
          )}
          {dragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] uppercase tracking-[0.15em] text-gold">
              Drop to select
            </div>
          )}
        </div>

        <div className="min-w-[14rem] flex-1 space-y-3">
          <p className="text-[11px] leading-relaxed text-white/45">
            {PRODUCT_IMAGE_ALLOWED_LABEL}, up to 10 MB. Resized to {PRODUCT_IMAGE_MAX_EDGE}px on the long edge and
            stripped of camera data; transparent PNGs stay transparent.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {(stage.kind === "uploading" || stage.kind === "processing") && (
            <div role="status" aria-live="polite">
              <div
                className="h-1.5 w-full overflow-hidden bg-white/10"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={stage.kind === "uploading" ? pct : undefined}
                aria-label="Upload progress"
              >
                {stage.kind === "uploading" ? (
                  <div
                    className="upload-progress-fill h-full bg-gold transition-[width] duration-200"
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                ) : (
                  <div className="h-full w-1/3 animate-pulse bg-gold" />
                )}
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-white/60">
                {stage.kind === "uploading"
                  ? `Uploading ${pct}% · ${mb(stage.loaded)} of ${mb(stage.total)} · ${elapsed}s`
                  : `Processing: resizing and compressing… · ${elapsed}s`}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {stage.kind === "selected" && (
              <>
                <button
                  type="button"
                  onClick={save}
                  className="border border-gold bg-gold px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-black hover:bg-transparent hover:text-gold"
                >
                  Save image
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/70 hover:border-gold hover:text-gold"
                >
                  Choose another
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStage({ kind: "idle" });
                    setError(null);
                  }}
                  className="px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/40 hover:text-white"
                >
                  Cancel
                </button>
              </>
            )}

            {stage.kind === "uploading" && (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/70 hover:text-white"
              >
                Cancel upload
              </button>
            )}

            {stage.kind === "idle" &&
              (currentUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/70 hover:border-gold hover:text-gold"
                  >
                    Replace image
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage({ kind: "confirm-remove" })}
                    className="border border-red-500/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-red-300/80 hover:border-red-400"
                  >
                    Remove image
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/70 hover:border-gold hover:text-gold"
                >
                  Choose file
                </button>
              ))}

            {stage.kind === "confirm-remove" && (
              <>
                <span className="self-center text-[11px] text-white/60">Remove this image? The shop falls back to the placeholder.</span>
                <button
                  type="button"
                  onClick={remove}
                  className="border border-red-500/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-red-300 hover:bg-red-500/20"
                >
                  Yes, remove
                </button>
                <button
                  type="button"
                  onClick={() => setStage({ kind: "idle" })}
                  className="px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/40 hover:text-white"
                >
                  Keep it
                </button>
              </>
            )}

            {stage.kind === "removing" && <span className="text-[11px] text-white/50">Removing…</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
