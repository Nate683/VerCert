// Adds the 5 new research compounds requested by the user. Verified chemical
// identity data (CAS/formula/MW) was looked up against PubChem — see comments
// per product. Business-specific fields the user did not supply (purity,
// storage, sizes/pricing, batch numbers) are left as explicit TODO
// placeholders per instruction — never invented.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set in .env.local.");
  process.exit(1);
}

const sql = neon(connectionString);
const now = new Date().toISOString();

const TODO_STORAGE = "TODO — storage conditions not yet provided.";
const TODO_SIZES = [{ label: "TODO — sizes/pricing not yet set", priceUsd: 0 }];
const TODO_BATCH = ["TODO-PENDING-COA"];
const TODO_SUMMARY_SUFFIX = " Purity, storage, sizing, and batch/COA data: TODO, pending lab documentation.";

const PRODUCTS = [
  {
    slug: "retatrutide",
    name: "Retatrutide",
    category: "Lyophilized Peptides",
    // Verified via PubChem substance record + Wikipedia infobox + DrugBank (DB18993).
    casNumber: "2381089-83-2",
    // PubChem has no discrete CID with computed formula/weight for this large
    // lipidated peptide, and ChEMBL/DrugBank gate the computed values behind
    // login — left as TODO rather than guessed.
    molecularFormula: "TODO — not yet verified against a structured chemical database.",
    molecularWeight: "TODO — not yet verified against a structured chemical database.",
    purityPercent: 0,
    sequenceOrForm:
      "39-residue triple GIP/GLP-1/glucagon receptor agonist peptide (Aib/MeLeu-modified, C20 fatty-diacid conjugated at Lys), per Eli Lilly LY3437943.",
    storage: TODO_STORAGE,
    sizes: TODO_SIZES,
    batchNumbers: TODO_BATCH,
    summary:
      "Synthetic 39-residue triple-agonist peptide, supplied as a lyophilized powder for laboratory research." +
      TODO_SUMMARY_SUFFIX,
    description: [
      "Retatrutide (CAS 2381089-83-2) is a synthetic peptide research compound incorporating Aib and alpha-methyl-leucine residues along with a C20 fatty-diacid modification at a lysine side chain, for extended in vitro stability studies.",
      "Supplied as a lyophilized powder for reconstitution under laboratory conditions.",
    ],
  },
  {
    slug: "ghk-cu",
    name: "GHK-Cu",
    category: "Lyophilized Peptides",
    // Verified via PubChem CID 133697840.
    casNumber: "300801-03-0",
    molecularFormula: "C28H48CuN12O8",
    molecularWeight: "744.3 g/mol",
    purityPercent: 0,
    sequenceOrForm: "Copper(II) complex of the tripeptide glycyl-L-histidyl-L-lysine (Gly-His-Lys · Cu).",
    storage: TODO_STORAGE,
    sizes: TODO_SIZES,
    batchNumbers: TODO_BATCH,
    summary:
      "Copper(II) complex of the tripeptide GHK, supplied as a lyophilized powder for laboratory research." +
      TODO_SUMMARY_SUFFIX,
    description: [
      "GHK-Cu (CAS 300801-03-0) is a copper(II) coordination complex of the naturally occurring tripeptide glycyl-L-histidyl-L-lysine.",
      "Supplied as a lyophilized powder for laboratory research use.",
    ],
  },
  {
    slug: "tesamorelin",
    name: "Tesamorelin",
    category: "Lyophilized Peptides",
    // Verified via PubChem CID 16137828.
    casNumber: "218949-48-5",
    molecularFormula: "C221H366N72O67S",
    molecularWeight: "5136 g/mol",
    purityPercent: 0,
    sequenceOrForm:
      "44-residue hGRF(1-44) analog (YADAIFTNSYRKVLGQLSARKLLQDIMSRQQGESNQERGARARL) with an N-terminal trans-3-hexenoyl modification.",
    storage: TODO_STORAGE,
    sizes: TODO_SIZES,
    batchNumbers: TODO_BATCH,
    summary:
      "Stabilized 44-residue GHRH analog, supplied as a lyophilized powder for laboratory research." +
      TODO_SUMMARY_SUFFIX,
    description: [
      "Tesamorelin (CAS 218949-48-5) is a stabilized synthetic analog of the 44-residue human growth hormone-releasing hormone sequence, carrying an N-terminal trans-3-hexenoyl modification.",
      "Supplied as a lyophilized powder for reconstitution under laboratory conditions.",
    ],
  },
  {
    slug: "cjc-1295-ipamorelin-blend",
    name: "CJC-1295 / Ipamorelin Blend",
    category: "Peptide Blends",
    // CJC-1295 verified via PubChem CID 91971820 (DAC-conjugated form — the
    // canonical "CJC-1295" PubChem record; a "without DAC"/Mod-GRF-1-29
    // variant also exists under a different CAS, TODO-flagged for the user
    // to confirm which is intended). Ipamorelin verified via PubChem CID 9831659.
    casNumber: "446262-90-4 (CJC-1295, DAC form); 170851-70-4 (Ipamorelin)",
    molecularFormula: "C165H269N47O46 (CJC-1295); C38H49N9O5 (Ipamorelin)",
    molecularWeight: "3647.2 g/mol (CJC-1295); 711.9 g/mol (Ipamorelin)",
    purityPercent: 0,
    sequenceOrForm:
      "Two-component blend: CJC-1295 (DAC-modified GHRH(1-29) analog) + Ipamorelin (Aib-His-D-2Nal-D-Phe-Lys-NH2 pentapeptide). TODO — confirm whether CJC-1295 with or without DAC is intended; formula/CAS above reflect the DAC form.",
    storage: TODO_STORAGE,
    sizes: TODO_SIZES,
    batchNumbers: TODO_BATCH,
    summary:
      "Two-peptide research blend combining CJC-1295 and Ipamorelin, co-lyophilized for laboratory research." +
      TODO_SUMMARY_SUFFIX,
    description: [
      "A two-component research blend combining CJC-1295 (a DAC-modified analog of human GHRH(1-29)) with Ipamorelin (a selective pentapeptide ghrelin-receptor ligand).",
      "Co-lyophilized and supplied as a powder for reconstitution under laboratory conditions.",
    ],
  },
  {
    slug: "melanotan-2",
    name: "Melanotan 2",
    category: "Lyophilized Peptides",
    // Verified via PubChem CID 92432.
    casNumber: "121062-08-6",
    molecularFormula: "C50H69N15O9",
    molecularWeight: "1024.2 g/mol",
    purityPercent: 0,
    sequenceOrForm: "Cyclic heptapeptide, Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-NH2.",
    storage: TODO_STORAGE,
    sizes: TODO_SIZES,
    batchNumbers: TODO_BATCH,
    summary:
      "Synthetic cyclic heptapeptide analog of alpha-MSH, supplied as a lyophilized powder for laboratory research." +
      TODO_SUMMARY_SUFFIX,
    description: [
      "Melanotan 2 (CAS 121062-08-6) is a synthetic cyclic heptapeptide analog of alpha-melanocyte-stimulating hormone, produced via solid-phase peptide synthesis.",
      "Supplied as a lyophilized powder for reconstitution under laboratory conditions.",
    ],
  },
];

async function main() {
  for (const [i, p] of PRODUCTS.entries()) {
    await sql`
      INSERT INTO products
        (slug, name, category, cas_number, molecular_formula, molecular_weight, purity_percent, sequence_or_form, storage, sizes, batch_numbers, summary, description, sort_order, active, created_at, updated_at)
      VALUES
        (${p.slug}, ${p.name}, ${p.category}, ${p.casNumber}, ${p.molecularFormula}, ${p.molecularWeight}, ${p.purityPercent}, ${p.sequenceOrForm}, ${p.storage}, ${JSON.stringify(p.sizes)}, ${JSON.stringify(p.batchNumbers)}, ${p.summary}, ${JSON.stringify(p.description)}, ${i}, false, ${now}, ${now})
      ON CONFLICT (slug) DO NOTHING
    `;
    await sql`
      INSERT INTO inventory (slug, quantity, threshold)
      VALUES (${p.slug}, 0, 10)
      ON CONFLICT (slug) DO NOTHING
    `;
  }
  console.log(`Seeded ${PRODUCTS.length} product(s).`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
