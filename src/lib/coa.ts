import { products } from "./products";
import type { CoaResult } from "./types";

const LABS = [
  "Aurum Analytical Laboratories",
  "Meridian Purity Labs",
  "Northgate Analytical Services",
];

function dateFromBatch(batch: string, offsetDays = 0) {
  const match = batch.match(/(\d{2})(\d{2})$/);
  const year = match ? 2000 + parseInt(match[1], 10) : 2025;
  const month = match ? parseInt(match[2], 10) : 1;
  const d = new Date(Date.UTC(year, Math.max(0, month - 1), 12 + offsetDays));
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function buildCoa(batch: string, index: number): CoaResult {
  const product = products.find((p) => p.batchNumbers.includes(batch));
  if (!product) {
    throw new Error(`No product found for batch ${batch}`);
  }
  const lab = LABS[index % LABS.length];
  return {
    batchNumber: batch,
    productName: product.name,
    casNumber: product.casNumber,
    purityPercent: product.purityPercent,
    testMethod: "Reverse-Phase HPLC / ESI Mass Spectrometry",
    dateTested: dateFromBatch(batch, -3),
    dateIssued: dateFromBatch(batch, 0),
    lab,
    appearance: "White to off-white lyophilized powder",
    tests: [
      {
        parameter: "Identity Confirmation",
        method: "ESI-MS",
        result: "Conforms — molecular ion matches reference standard",
      },
      {
        parameter: "Purity (HPLC Area %)",
        method: "RP-HPLC, 220 nm",
        result: `${product.purityPercent.toFixed(1)}%`,
      },
      {
        parameter: "Water Content",
        method: "Karl Fischer Titration",
        result: "≤ 8.0%",
      },
      {
        parameter: "Heavy Metals",
        method: "ICP-MS",
        result: "Not Detected (< 10 ppm)",
      },
      {
        parameter: "Bacterial Endotoxins",
        method: "LAL Test",
        result: "Not Detected",
      },
      {
        parameter: "Microbial Limits",
        method: "USP <61>/<62>",
        result: "Conforms — within limits",
      },
    ],
  };
}

export const coaDatabase: Record<string, CoaResult> = Object.fromEntries(
  products.flatMap((p) => p.batchNumbers).map((batch, i) => [batch, buildCoa(batch, i)])
);

export function lookupCoa(batchNumber: string): CoaResult | null {
  const key = batchNumber.trim().toUpperCase();
  return coaDatabase[key] ?? null;
}
