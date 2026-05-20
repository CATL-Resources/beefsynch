/* ── Billing shared types, constants, and helpers ── */

import { formatTime12 } from "@/lib/formatUtils";
export { formatTime12 };

export interface BillingProduct {
  id: string;
  product_name: string;
  product_category: string;
  drug_name: string | null;
  doses_per_unit: number | null;
  unit_label: string | null;
  default_price: number | null;
  is_default: boolean | null;
  sort_order: number | null;
}

export interface ProductLine {
  id?: string;
  billing_id: string;
  billing_product_id: string | null;
  product_name: string;
  product_category: string | null;
  protocol_event_label: string | null;
  event_date: string | null;
  doses: number;
  doses_per_unit: number | null;
  unit_label: string | null;
  units_calculated: number | null;
  units_billed: number | null;
  units_returned: number | null;
  unit_price: number | null;
  line_total: number | null;
  sort_order: number | null;
  invoiced?: boolean;
  invoiced_at?: string | null;
  session_id?: string | null;
  delivery_method?: string | null;
}

export interface SessionLine {
  id?: string;
  billing_id: string;
  session_date: string;
  session_label: string | null;
  time_of_day: string | null;
  head_count: number | null;
  crew: string | null;
  notes: string | null;
  sort_order: number | null;
  invoiced?: boolean;
  invoiced_at?: string | null;
  session_type?: string | null;
}

export interface SessionInventoryLine {
  id?: string;
  billing_id: string;
  session_id: string;
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  canister: string;
  start_units: number | null;
  end_units: number | null;
  blown_units: number | null;
  returned_units: number | null;
  sort_order: number | null;
}

export interface SemenLine {
  id?: string;
  billing_id: string;
  bull_catalog_id: string | null;
  bull_name: string;
  bull_code: string | null;
  units_packed: number | null;
  units_returned: number | null;
  units_blown: number | null;
  units_billable: number | null;
  unit_price: number | null;
  line_total: number | null;
  sort_order: number | null;
  invoiced?: boolean;
  invoiced_at?: string | null;
  semen_owner?: string | null;
}

export interface LaborLine {
  id?: string;
  billing_id: string;
  description: string | null;
  labor_dates: string | null;
  amount: number | null;
  sort_order: number | null;
  invoiced?: boolean;
  invoiced_at?: string | null;
}

/* ── Constants ── */

// Project-status badge colors. The billing record's own `status` column is
// deprecated — the project's status is the single source of truth.
export const PROJECT_STATUS_COLORS: Record<string, string> = {
  "Tentative": "bg-gray-500/15 text-gray-400",
  "Confirmed": "bg-blue-500/15 text-blue-400",
  "In Field": "bg-amber-500/15 text-amber-400",
  "Ready to Bill": "bg-emerald-500/15 text-emerald-400",
  "Invoiced": "bg-purple-500/15 text-purple-400",
};

/* ── Helpers ── */

export function calcUnits(doses: number, dpu: number | null) {
  if (!dpu || dpu <= 0) return doses;
  return doses / dpu;
}

export function formatCurrency(v: number | null) {
  if (v == null) return "$0.00";
  return `$${v.toFixed(2)}`;
}

export function isBreedingSession(s: SessionLine) {
  const label = (s.session_label || "").toLowerCase();
  return label.includes("breed") || label.includes("ai ") || label === "ai" || label.includes("tai");
}

export function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) next.delete(item); else next.add(item);
  return next;
}
