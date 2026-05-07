// src/lib/bullDisplay.ts
//
// Shared helper for resolving a bull's display name and matching search queries.
// Use this EVERYWHERE a bull name appears in the UI or a search filters bulls.
//
// The rule (fallback order for display):
//   custom_bull_name → bulls_catalog.bull_name → bull_code → "Unknown"
//
// Why this exists: inventory rows can have a custom_bull_name override (used for
// one-off bulls not in the catalog) OR a proper catalog link. Different views
// have historically resolved this inconsistently, causing the same row to show
// one name on one page and a different name on another. Centralize the logic
// here so every consumer stays in sync.

export interface BullNameSource {
  custom_bull_name?: string | null;
  bull_code?: string | null;
  // Supabase embedded queries may return this under either name
  // depending on how the select string is written.
  bulls_catalog?: {
    bull_name?: string | null;
    naab_code?: string | null;
  } | null;
  bull_catalog?: {
    bull_name?: string | null;
    naab_code?: string | null;
  } | null;
}

/**
 * Get the display name for a bull-holding row. Use this in every table cell,
 * card header, and detail heading that shows a bull name.
 */
export function getBullDisplayName(row: BullNameSource | null | undefined): string {
  if (!row) return "Unknown";
  if (row.custom_bull_name?.trim()) return row.custom_bull_name.trim();
  const catalog = row.bulls_catalog ?? row.bull_catalog;
  if (catalog?.bull_name?.trim()) return catalog.bull_name.trim();
  if (row.bull_code?.trim()) return row.bull_code.trim();
  return "Unknown";
}

/**
 * Get the NAAB code for a bull-holding row.
 * Prefers bulls_catalog.naab_code (source of truth), falls back to bull_code on the row.
 */
export function getBullDisplayCode(row: BullNameSource | null | undefined): string | null {
  if (!row) return null;
  const catalog = row.bulls_catalog ?? row.bull_catalog;
  const code = catalog?.naab_code?.trim() || row.bull_code?.trim() || "";
  return code || null;
}

/**
 * Get the display label "Name (CODE)" — name first, NAAB code in parens when available.
 * If there's no code, just the name. If the name and code are the same (e.g. custom bulls
 * stored under their code), only the name is returned.
 */
export function getBullDisplayLabel(row: BullNameSource | null | undefined): string {
  const name = getBullDisplayName(row);
  const code = getBullDisplayCode(row);
  if (!code || code === name) return name;
  return `${name} (${code})`;
}

/**
 * Check whether a bull-holding row matches a free-text search query.
 * Returns true for empty queries (so the search bar being empty means
 * "show everything"). Matches case-insensitively against: custom name,
 * catalog name, bull code (NAAB), catalog NAAB.
 */
export function bullMatchesQuery(
  row: BullNameSource | null | undefined,
  query: string
): boolean {
  if (!query.trim()) return true;
  if (!row) return false;
  const q = query.trim().toLowerCase();
  const catalog = row.bulls_catalog ?? row.bull_catalog;
  const fields = [
    row.custom_bull_name,
    catalog?.bull_name,
    row.bull_code,
    catalog?.naab_code,
  ];
  return fields.some(
    (s) => typeof s === "string" && s.toLowerCase().includes(q)
  );
}
