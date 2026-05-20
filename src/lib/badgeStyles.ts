// Centralized badge style definitions
export const BADGE_STYLES = {
  projectStatus: {
    Tentative: "bg-gray-500/15 text-gray-400",
    Confirmed: "bg-blue-500/15 text-blue-400",
    "In Field": "bg-amber-500/15 text-amber-400",
    "Ready to Bill": "bg-emerald-500/15 text-emerald-400",
    Invoiced: "bg-purple-500/15 text-purple-400",
  },
  projectType: {
    Heifer: "bg-info/20 text-info",
    Cow: "bg-accent/20 text-accent",
  },
  orderFulfillment: {
    pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    backordered: "bg-red-500/20 text-red-300 border-red-500/30",
    partially_fulfilled: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    ordered: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    shipped: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    fulfilled: "bg-green-500/20 text-green-300 border-green-500/30",
  },
  orderBilling: {
    unbilled: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    invoiced: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    paid: "bg-green-500/20 text-green-300 border-green-500/30",
  },
  logType: {
    received: "bg-green-500/20 text-green-300 border-green-500/30",
    pack_out: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    unpack_return: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    used_in_field: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    manual_add: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    transfer_in: "bg-green-500/20 text-green-300 border-green-500/30",
    transfer_out: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    adjustment: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  },
  packStatus: {
    packed: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    in_field: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    shipped: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    picked_up: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    unpacked: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    tank_returned: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    cancelled: "bg-muted text-muted-foreground border-border",
  },
  packType: {
    project: "text-xs capitalize",
    shipment: "text-xs capitalize",
    order: "text-xs capitalize",
    pickup: "text-xs capitalize",
  },
  tankType: {
    customer_tank: "bg-teal-600/20 text-teal-400 border-teal-600/30",
    inventory_tank: "bg-purple-600/20 text-purple-400 border-purple-600/30",
    shipper: "bg-blue-600/20 text-blue-400 border-blue-600/30",
    mushroom: "bg-blue-600/20 text-blue-400 border-blue-600/30",
    rental_tank: "bg-amber-600/20 text-amber-400 border-amber-600/30",
    communal_tank: "bg-orange-600/20 text-orange-400 border-orange-600/30",
    freeze_branding: "bg-muted text-muted-foreground border-border",
  },
  tankStatus: {
    wet: "bg-green-600/20 text-green-400 border-green-600/30",
    dry: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
    out: "bg-blue-600/20 text-blue-400 border-blue-600/30",
    inactive: "bg-muted text-muted-foreground border-border",
    bad_tank: "bg-destructive/20 text-destructive border-destructive/30",
    "bad tank": "bg-destructive/20 text-destructive border-destructive/30",
    unknown: "bg-muted text-muted-foreground border-border",
  },
} as const;

export type BadgeCategory = keyof typeof BADGE_STYLES;

// Standalone color maps consumed directly via lookup at call sites.
// Mirrors entries in BADGE_STYLES; exported here for legacy import patterns.
export const statusColor: Record<string, string> = {
  Tentative: "bg-gray-500/15 text-gray-400",
  Confirmed: "bg-blue-500/15 text-blue-400",
  "In Field": "bg-amber-500/15 text-amber-400",
  "Ready to Bill": "bg-emerald-500/15 text-emerald-400",
  Invoiced: "bg-purple-500/15 text-purple-400",
};

export const fulfillmentColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  backordered: "bg-red-500/20 text-red-300 border-red-500/30",
  partially_fulfilled: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  ordered: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  shipped: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  fulfilled: "bg-green-500/20 text-green-300 border-green-500/30",
};

export const billingColors: Record<string, string> = {
  unbilled: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  invoiced: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  paid: "bg-green-500/20 text-green-300 border-green-500/30",
};

export function getBadgeClass(category: BadgeCategory, value: string): string {
  const styles = BADGE_STYLES[category] as Record<string, string>;
  return styles[value] ?? "bg-muted text-muted-foreground";
}
