/** SKUs are case-insensitive for humans, so we store them upper-case without extra spaces. */
export function normalizeSku(sku: string): string {
  return sku.trim().replace(/\s+/g, '-').toUpperCase();
}

/** Trims a string and turns empty strings into null, so optional text fields stay clean. */
export function clean(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Text field in an update (PATCH): undefined leaves it unchanged, "" clears it (null),
 * anything else is trimmed and optionally transformed (e.g. upper-cased).
 */
export function patchText(
  value: string | undefined,
  transform: (v: string) => string = (v) => v,
): string | null | undefined {
  if (value === undefined) return undefined;
  const cleaned = clean(value);
  return cleaned === null ? null : transform(cleaned);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Minimal RFC 4180 CSV writer. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
}
