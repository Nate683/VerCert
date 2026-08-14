// Minimal CSV builder — no external dependency needed for this dataset size.
export function toCsv(rows: Record<string, string | number>[], columns: string[]): string {
  const escape = (value: string | number) => {
    const str = String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const header = columns.map(escape).join(",");
  const body = rows.map((row) => columns.map((col) => escape(row[col] ?? "")).join(","));
  return [header, ...body].join("\n");
}
