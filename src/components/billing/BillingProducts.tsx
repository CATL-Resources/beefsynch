import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SectionHeader from "./SectionHeader";

interface BillingProductsProps {
  billingId: string;
  orgId: string | null | undefined;
  isEditing: boolean;
  onToggleEdit: () => void;
  locked: boolean;
}

type ProductRow = {
  id: string;
  protocol_event_label: string | null;
  product_name: string;
  doses: number | null;
  doses_per_unit: number | null;
  units_billed: number | null;
  unit_price: number | null;
  line_total: number | null;
  unit_label: string | null;
  delivery_method: string | null;
  billing_product_id: string | null;
  product_category: string | null;
  sort_order: number | null;
};

type CatalogProduct = {
  id: string;
  product_name: string;
  product_category: string | null;
  default_price: number | null;
  unit_label: string | null;
  doses_per_unit: number | null;
};

const DELIVERY_CYCLE = [
  { value: "not_yet", label: "Not Done", className: "bg-gray-500/15 text-gray-400 hover:bg-gray-500/25" },
  { value: "delivered", label: "Delivered", className: "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25" },
  { value: "customer_pickup", label: "Cust Pickup", className: "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25" },
  { value: "customer_administered", label: "Cust Admin", className: "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25" },
  { value: "catl_administered", label: "CATL Admin", className: "bg-purple-500/15 text-purple-400 hover:bg-purple-500/25" },
];
const nextDelivery = (current: string | null | undefined) => {
  const i = DELIVERY_CYCLE.findIndex((d) => d.value === (current || "not_yet"));
  return DELIVERY_CYCLE[(i + 1) % DELIVERY_CYCLE.length].value;
};

const formatCurrency = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toFixed(2)}`;

export default function BillingProducts({ billingId, orgId, isEditing, onToggleEdit, locked }: BillingProductsProps) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: lines = [] } = useQuery({
    queryKey: ["billing_products_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_billing_products")
        .select("*")
        .eq("billing_id", billingId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["billing_catalog_v2", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_products")
        .select("id, product_name, product_category, default_price, unit_label, doses_per_unit")
        .eq("organization_id", orgId!)
        .eq("active", true)
        .order("product_category")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CatalogProduct[];
    },
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["billing_products_v2", billingId] });

  const computeLineTotal = (units_billed: number | null, unit_price: number | null) =>
    Number((Number(units_billed ?? 0) * Number(unit_price ?? 0)).toFixed(2));

  const saveField = async (line: ProductRow, patch: Partial<ProductRow>) => {
    const next = { ...line, ...patch };
    next.line_total = computeLineTotal(next.units_billed, next.unit_price);
    const { id, ...rest } = next;
    const { error } = await supabase
      .from("project_billing_products")
      .update(rest)
      .eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Product saved" });
    refetch();
  };

  const addProduct = async (catalogId: string) => {
    const prod = catalog.find((p) => p.id === catalogId);
    if (!prod) return;
    const { error } = await supabase.from("project_billing_products").insert({
      billing_id: billingId,
      billing_product_id: prod.id,
      product_name: prod.product_name,
      product_category: prod.product_category,
      doses_per_unit: prod.doses_per_unit,
      unit_label: prod.unit_label,
      unit_price: prod.default_price,
      delivery_method: "not_yet",
      sort_order: lines.length,
    });
    setPickerOpen(false);
    if (error) {
      toast({ title: "Could not add", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Product added" });
    refetch();
  };

  const removeLine = async (id: string) => {
    const { error } = await supabase.from("project_billing_products").delete().eq("id", id);
    if (error) {
      toast({ title: "Remove failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Product removed" });
    refetch();
  };

  const grouped = catalog.reduce((acc, p) => {
    const cat = p.product_category || "other";
    (acc[cat] ||= []).push(p);
    return acc;
  }, {} as Record<string, CatalogProduct[]>);

  const sectionTotal = lines.reduce((s, l) => s + (l.line_total ?? 0), 0);

  return (
    <section className={`rounded-xl border bg-card/50 p-4 space-y-3 ${isEditing ? "border-primary/40 ring-1 ring-primary/30" : "border-border"}`}>
      <SectionHeader
        title="Products & Services"
        isEditing={isEditing}
        onToggleEdit={onToggleEdit}
        locked={locked}
        right={<span className="text-sm font-semibold tabular-nums">{formatCurrency(sectionTotal)}</span>}
      />
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Product</th>
              <th className="text-right px-3 py-2 font-medium w-[70px]">Qty</th>
              <th className="text-right px-3 py-2 font-medium w-[80px]">Price</th>
              <th className="text-left px-3 py-2 font-medium w-[130px]">Delivery</th>
              <th className="text-right px-3 py-2 font-medium w-[90px]">Total</th>
              <th className="w-[36px]" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No products yet.</td></tr>
            ) : lines.map((l) => {
              const delivery = DELIVERY_CYCLE.find((d) => d.value === (l.delivery_method || "not_yet")) ?? DELIVERY_CYCLE[0];
              return (
                <tr key={l.id} className="border-t border-border/40">
                  <td className="px-3 py-2">
                    <span className="font-medium">{l.product_name}</span>
                    {l.protocol_event_label && l.protocol_event_label !== "—" && (
                      <span className="ml-2 text-[10px] text-muted-foreground">{l.protocol_event_label}</span>
                    )}
                    {(l.doses_per_unit ?? 0) > 1 && (
                      <div className="text-[10px] text-muted-foreground/60">
                        {l.doses_per_unit} doses/{l.unit_label || "unit"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      inputMode="decimal"
                      disabled={!isEditing}
                      className="h-7 w-14 text-right text-[15px] font-medium text-emerald-500 ml-auto"
                      defaultValue={l.units_billed ?? ""}
                      placeholder="—"
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v === l.units_billed) return;
                        saveField(l, { units_billed: v });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      inputMode="decimal"
                      disabled={!isEditing}
                      className="h-7 w-[72px] text-right text-xs ml-auto"
                      defaultValue={l.unit_price ?? ""}
                      placeholder="—"
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v === l.unit_price) return;
                        saveField(l, { unit_price: v });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={!isEditing}
                      onClick={() => isEditing && saveField(l, { delivery_method: nextDelivery(l.delivery_method) })}
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${isEditing ? "cursor-pointer" : "cursor-default"} ${delivery.className}`}
                    >
                      {delivery.label}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={(l.line_total ?? 0) > 0 ? "text-emerald-500 font-medium text-[15px]" : "text-muted-foreground"}>
                      {formatCurrency(l.line_total)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => removeLine(l.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div hidden={!isEditing}>
        <Select open={pickerOpen} onOpenChange={setPickerOpen} value="" onValueChange={addProduct}>
          <SelectTrigger className="w-fit h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> <SelectValue placeholder="Add product…" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(grouped).map(([category, items]) => (
              <SelectGroup key={category}>
                <SelectLabel className="text-xs uppercase text-muted-foreground">
                  {category.replace(/_/g, " ")}
                </SelectLabel>
                {items.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.product_name}
                    {p.default_price ? ` — ${formatCurrency(p.default_price)}` : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
