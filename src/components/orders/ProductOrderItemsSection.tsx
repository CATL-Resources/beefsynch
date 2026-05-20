import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface ProductOrderItemsSectionProps {
  orderId: string;
  orgId: string | null | undefined;
}

type ProductItem = {
  id: string;
  semen_order_id: string;
  billing_product_id: string | null;
  product_name: string;
  quantity: number;
  unit_label: string | null;
  unit_price: number;
  line_total: number;
  delivery_method: string | null;
  item_status: string | null;
  notes: string | null;
};

type CatalogProduct = {
  id: string;
  product_name: string;
  product_category: string | null;
  default_price: number | null;
  unit_label: string | null;
};

const DELIVERY_OPTIONS = [
  { value: "not_yet", label: "Not Done" },
  { value: "delivered", label: "Delivered" },
  { value: "customer_pickup", label: "Customer Picked Up" },
  { value: "customer_administered", label: "Customer Administered" },
  { value: "catl_administered", label: "CATL Administered" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "ordered", label: "Ordered" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

const formatCurrency = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toFixed(2)}`;

export default function ProductOrderItemsSection({ orderId, orgId }: ProductOrderItemsSectionProps) {
  const queryClient = useQueryClient();
  const [addingOpen, setAddingOpen] = useState(false);
  const [addProductId, setAddProductId] = useState<string>("");
  const [addQty, setAddQty] = useState<string>("");
  const [addPrice, setAddPrice] = useState<string>("");

  const { data: items = [] } = useQuery({
    queryKey: ["product_order_items", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_order_items")
        .select("*")
        .eq("semen_order_id", orderId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ProductItem[];
    },
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["billing_products_catalog", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_products")
        .select("id, product_name, product_category, default_price, unit_label")
        .eq("organization_id", orgId!)
        .eq("active", true)
        .order("product_category")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CatalogProduct[];
    },
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["product_order_items", orderId] });

  const grouped = catalog.reduce((acc, p) => {
    const cat = p.product_category || "other";
    (acc[cat] ||= []).push(p);
    return acc;
  }, {} as Record<string, CatalogProduct[]>);

  const selectedCatalog = catalog.find((p) => p.id === addProductId);

  const handleProductPick = (id: string) => {
    setAddProductId(id);
    const p = catalog.find((c) => c.id === id);
    if (p && !addPrice) setAddPrice(String(p.default_price ?? ""));
  };

  const handleAdd = async () => {
    if (!addProductId || !addQty || Number(addQty) <= 0) {
      toast({ title: "Pick a product and quantity", variant: "destructive" });
      return;
    }
    const p = catalog.find((c) => c.id === addProductId);
    if (!p) return;
    const { error } = await supabase.from("product_order_items").insert({
      semen_order_id: orderId,
      billing_product_id: p.id,
      product_name: p.product_name,
      quantity: Number(addQty),
      unit_label: p.unit_label,
      unit_price: addPrice === "" ? (p.default_price ?? 0) : Number(addPrice),
      delivery_method: "not_yet",
      item_status: "pending",
    });
    if (error) {
      toast({ title: "Could not add product", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Product added" });
    setAddingOpen(false);
    setAddProductId("");
    setAddQty("");
    setAddPrice("");
    refetch();
  };

  const saveField = async (item: ProductItem, patch: Partial<ProductItem>) => {
    const { error } = await supabase
      .from("product_order_items")
      .update(patch)
      .eq("id", item.id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    refetch();
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from("product_order_items").delete().eq("id", id);
    if (error) {
      toast({ title: "Remove failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removed" });
    refetch();
  };

  const total = items.reduce((s, i) => s + (i.line_total ?? 0), 0);

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold tracking-tight uppercase text-muted-foreground">Products &amp; Supplies</h2>
        <span className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</span>
      </div>
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Product</th>
              <th className="text-right px-3 py-2 font-medium w-[70px]">Qty</th>
              <th className="text-left px-3 py-2 font-medium w-[80px]">Unit</th>
              <th className="text-right px-3 py-2 font-medium w-[90px]">Price</th>
              <th className="text-right px-3 py-2 font-medium w-[90px]">Total</th>
              <th className="text-left px-3 py-2 font-medium w-[160px]">Delivery</th>
              <th className="text-left px-3 py-2 font-medium w-[120px]">Status</th>
              <th className="w-[36px]" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">No product items yet.</td></tr>
            ) : items.map((i) => (
              <tr key={i.id} className="border-t border-border/40">
                <td className="px-3 py-2 font-medium truncate">{i.product_name}</td>
                <td className="px-3 py-2 text-right">
                  <Input
                    inputMode="numeric"
                    className="h-7 w-[60px] text-right text-xs ml-auto"
                    defaultValue={i.quantity}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v) || v <= 0 || v === i.quantity) return;
                      saveField(i, { quantity: v });
                    }}
                  />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{i.unit_label || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Input
                    inputMode="decimal"
                    className="h-7 w-[78px] text-right text-xs ml-auto"
                    defaultValue={i.unit_price ?? ""}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v) || v === i.unit_price) return;
                      saveField(i, { unit_price: v });
                    }}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(i.line_total)}</td>
                <td className="px-3 py-2">
                  <Select value={i.delivery_method ?? "not_yet"} onValueChange={(v) => saveField(i, { delivery_method: v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DELIVERY_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Select value={i.item_status ?? "pending"} onValueChange={(v) => saveField(i, { item_status: v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeItem(i.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove product"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addingOpen ? (
        <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_100px_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Product</Label>
              <Select value={addProductId} onValueChange={handleProductPick}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Pick a product…" />
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
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Qty</Label>
              <Input
                inputMode="numeric"
                placeholder={selectedCatalog?.unit_label || "qty"}
                value={addQty}
                onChange={(e) => setAddQty(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Price</Label>
              <Input
                inputMode="decimal"
                placeholder={selectedCatalog?.default_price ? String(selectedCatalog.default_price) : "—"}
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-9" onClick={handleAdd}>Add</Button>
              <Button
                variant="ghost" size="sm" className="h-9"
                onClick={() => { setAddingOpen(false); setAddProductId(""); setAddQty(""); setAddPrice(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAddingOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add product
        </Button>
      )}
      {items.some((i) => i.delivery_method) && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(new Set(items.map((i) => i.delivery_method).filter(Boolean))).map((d) => (
            <Badge key={d} variant="outline" className="text-xs capitalize">{(d || "").replace(/_/g, " ")}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}
