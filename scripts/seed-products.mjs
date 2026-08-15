// Seeds placeholder catalog products so the shop/admin/image pipeline can be
// fully exercised before real product data is provided. Every field is
// obviously a placeholder — replace via the /command Products tab, or ask
// for real product data to be loaded via a follow-up script.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env.local. See LAUNCH_CHECKLIST.md.");
  process.exit(1);
}

const sql = neon(connectionString);

const now = new Date().toISOString();

const PLACEHOLDER_PRODUCTS = [
  {
    slug: "placeholder-compound-a",
    name: "Placeholder Compound A",
    category: "Lyophilized Peptides",
    casNumber: "PLACEHOLDER-000-0",
    molecularFormula: "C0H0N0O0",
    molecularWeight: "0.00 g/mol",
    purityPercent: 99.0,
    sequenceOrForm: "Replace with real sequence/form",
    storage: "Replace with real storage instructions.",
    sizes: [
      { label: "5 mg", priceUsd: 0 },
      { label: "10 mg", priceUsd: 0 },
    ],
    batchNumbers: ["VC-PLACEHOLDER-01"],
    summary: "Placeholder listing — replace with real product data from the /command Products tab.",
    description: ["Placeholder description. Replace before launch."],
  },
  {
    slug: "placeholder-compound-b",
    name: "Placeholder Compound B",
    category: "Lyophilized Peptides",
    casNumber: "PLACEHOLDER-000-1",
    molecularFormula: "C0H0N0O0",
    molecularWeight: "0.00 g/mol",
    purityPercent: 99.0,
    sequenceOrForm: "Replace with real sequence/form",
    storage: "Replace with real storage instructions.",
    sizes: [
      { label: "5 mg", priceUsd: 0 },
      { label: "10 mg", priceUsd: 0 },
    ],
    batchNumbers: ["VC-PLACEHOLDER-02"],
    summary: "Placeholder listing — replace with real product data from the /command Products tab.",
    description: ["Placeholder description. Replace before launch."],
  },
  {
    slug: "placeholder-blend-a",
    name: "Placeholder Blend A",
    category: "Peptide Blends",
    casNumber: "PLACEHOLDER-000-2",
    molecularFormula: "C0H0N0O0",
    molecularWeight: "0.00 g/mol",
    purityPercent: 99.0,
    sequenceOrForm: "Replace with real sequence/form",
    storage: "Replace with real storage instructions.",
    sizes: [{ label: "10 mg", priceUsd: 0 }],
    batchNumbers: ["VC-PLACEHOLDER-03"],
    summary: "Placeholder listing — replace with real product data from the /command Products tab.",
    description: ["Placeholder description. Replace before launch."],
  },
  {
    slug: "placeholder-molecule-a",
    name: "Placeholder Molecule A",
    category: "Small Molecules",
    casNumber: "PLACEHOLDER-000-3",
    molecularFormula: "C0H0N0O0",
    molecularWeight: "0.00 g/mol",
    purityPercent: 99.0,
    sequenceOrForm: "Replace with real form",
    storage: "Replace with real storage instructions.",
    sizes: [{ label: "100 mg", priceUsd: 0 }],
    batchNumbers: ["VC-PLACEHOLDER-04"],
    summary: "Placeholder listing — replace with real product data from the /command Products tab.",
    description: ["Placeholder description. Replace before launch."],
  },
];

async function main() {
  for (const [i, p] of PLACEHOLDER_PRODUCTS.entries()) {
    await sql`
      INSERT INTO products
        (slug, name, category, cas_number, molecular_formula, molecular_weight, purity_percent, sequence_or_form, storage, sizes, batch_numbers, summary, description, sort_order, created_at, updated_at)
      VALUES
        (${p.slug}, ${p.name}, ${p.category}, ${p.casNumber}, ${p.molecularFormula}, ${p.molecularWeight}, ${p.purityPercent}, ${p.sequenceOrForm}, ${p.storage}, ${JSON.stringify(p.sizes)}, ${JSON.stringify(p.batchNumbers)}, ${p.summary}, ${JSON.stringify(p.description)}, ${i}, ${now}, ${now})
      ON CONFLICT (slug) DO NOTHING
    `;
    await sql`
      INSERT INTO inventory (slug, quantity, threshold)
      VALUES (${p.slug}, 0, 10)
      ON CONFLICT (slug) DO NOTHING
    `;
  }
  console.log(`[db:seed-products] Seeded ${PLACEHOLDER_PRODUCTS.length} placeholder product(s).`);
}

main().catch((err) => {
  console.error("[db:seed-products] Failed:", err);
  process.exit(1);
});
