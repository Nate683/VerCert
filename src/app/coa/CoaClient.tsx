"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { CoaResult } from "@/lib/types";

async function fetchCoa(batch: string): Promise<CoaResult | null> {
  const res = await fetch(`/api/coa?batch=${encodeURIComponent(batch)}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.result ?? null;
}

function CoaLookupForm() {
  const searchParams = useSearchParams();
  const [batchInput, setBatchInput] = useState("");
  const [result, setResult] = useState<CoaResult | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  // The batch actually looked up, so the "not found" message can't disagree
  // with what the customer has since typed into the box.
  const [searched, setSearched] = useState("");

  useEffect(() => {
    const prefill = searchParams.get("batch");
    if (!prefill) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from the URL query on mount
    setBatchInput(prefill);
    setSearched(prefill);
    setLoading(true);
    fetchCoa(prefill)
      .then(setResult)
      .finally(() => setLoading(false));
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const batch = batchInput.trim();
    if (!batch || loading) return;
    setSearched(batch);
    setLoading(true);
    try {
      setResult(await fetchCoa(batch));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row">
        <label htmlFor="coa-lookup" className="sr-only">
          Batch number
        </label>
        <input
          id="coa-lookup"
          type="text"
          value={batchInput}
          onChange={(e) => setBatchInput(e.target.value)}
          placeholder="e.g. VC-BPC-2411"
          autoComplete="off"
          spellCheck={false}
          className="w-full border border-white/15 bg-black/30 px-4 py-3 font-mono text-sm text-white placeholder:text-white/30 focus:border-gold focus:outline-none sm:flex-1"
        />
        <button
          type="submit"
          disabled={loading || !batchInput.trim()}
          className="border border-gold bg-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gold disabled:hover:text-black"
        >
          {loading ? "Checking…" : "Verify"}
        </button>
      </form>

      {loading && (
        <div className="mt-10 space-y-4 border border-white/10 p-8">
          <div className="skeleton h-3 w-40" />
          <div className="skeleton h-8 w-64" />
          <div className="skeleton h-3 w-32" />
          <div className="skeleton h-40 w-full" />
        </div>
      )}

      {!loading && result === null && (
        <div className="mt-10 border border-white/15 p-8 text-center">
          <p className="font-serif text-xl text-white">No record for that batch</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/50">
            Nothing is filed under &ldquo;{searched}&rdquo;. Batch numbers are
            printed on the vial label and look like{" "}
            <span className="font-mono text-white/70">VC-BPC-2411</span> —
            check for a mistyped character or a missing hyphen.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link
              href="/how-we-test"
              className="border border-white/20 px-5 py-2.5 text-xs uppercase tracking-[0.16em] text-white/70 transition-colors hover:border-gold hover:text-gold"
            >
              How We Test
            </Link>
            <Link
              href="/contact"
              className="border border-white/20 px-5 py-2.5 text-xs uppercase tracking-[0.16em] text-white/70 transition-colors hover:border-gold hover:text-gold"
            >
              Ask Us About It
            </Link>
          </div>
        </div>
      )}

      {!loading && result && (
        <div className="mt-10 border border-gold/40 p-8">
          <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-gold">
                Certificate of Analysis
              </p>
              <h2 className="mt-2 font-serif text-2xl text-white">{result.productName}</h2>
              <p className="mt-1 font-mono text-xs text-white/40">Batch {result.batchNumber}</p>
              <p className="mt-3 font-mono text-3xl text-gold">
                {result.purityPercent.toFixed(1)}%
                <span className="ml-2 font-sans text-xs uppercase tracking-[0.18em] text-white/40">
                  Purity
                </span>
              </p>
            </div>
            <div className="text-sm text-white/60 sm:text-right">
              <p>Issued {result.dateIssued}</p>
              <p>Tested {result.dateTested}</p>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-4 border-b border-white/10 pb-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.15em] text-white/40">CAS Number</dt>
              <dd className="mt-1 text-sm text-white">{result.casNumber}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.15em] text-white/40">Appearance</dt>
              <dd className="mt-1 text-sm text-white">{result.appearance}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.15em] text-white/40">Test Method</dt>
              <dd className="mt-1 text-sm text-white">{result.testMethod}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.15em] text-white/40">Testing Laboratory</dt>
              <dd className="mt-1 text-sm text-white">{result.lab}</dd>
            </div>
          </dl>

          <div className="mt-6">
            <h3 className="text-xs uppercase tracking-[0.15em] text-gold">Analytical Results</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/15 text-xs uppercase tracking-[0.1em] text-white/40">
                    <th className="pb-3 pr-4 font-normal">Parameter</th>
                    <th className="pb-3 pr-4 font-normal">Method</th>
                    <th className="pb-3 font-normal">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tests.map((test) => (
                    <tr key={test.parameter} className="border-b border-white/5 text-white/80">
                      <td className="py-3 pr-4">{test.parameter}</td>
                      <td className="py-3 pr-4 text-white/50">{test.method}</td>
                      <td className="py-3">{test.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-white/40">
            This certificate reflects analysis of the referenced batch only.
            For laboratory research use. Not for human or veterinary use.
          </p>

          {result.fileUrl && (
            <a
              href={result.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block border border-gold px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black"
            >
              Download Signed Certificate
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function CoaClient() {
  return (
    <Suspense fallback={null}>
      <CoaLookupForm />
    </Suspense>
  );
}
