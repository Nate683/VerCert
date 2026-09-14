// Minimal CSV builder — no external dependency needed for this dataset size.

// Spreadsheet apps run a cell that begins with = + - or @ as a formula, and
// some exports carry text customers typed themselves (names, company). Such a
// value gets a leading apostrophe so it stays inert; plain numbers pass.
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
}

export function toCsv(rows: Record<string, string | number>[], columns: string[]): string {
  const escape = (value: string | number) => {
    const str = typeof value === "string" ? neutralizeFormula(value) : String(value);
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const header = columns.map(escape).join(",");
  const body = rows.map((row) => columns.map((col) => escape(row[col] ?? "")).join(","));
  return [header, ...body].join("\n");
}
