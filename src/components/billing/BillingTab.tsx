import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { ProductLine, SemenLine, LaborLine, formatCurrency } from "./billingTypes";

const DELIVERY_OPTIONS = [
  { value: "not_yet", label: "Not yet", className: "border border-dashed border-border text-muted-foreground" },
  { value: "pickup", label: "Pickup", className: "bg-blue-500/15 text-blue-600" },
  { value: "we_gave", label: "We gave", className: "bg-emerald-500/15 text-emerald-600" },
  { value: "drop_off", label: "Drop off", className: "bg-amber-500/15 text-amber-600" },
] as const;

function nextDelivery(current: string | null | undefined): string {
  const order = ["not_yet", "pickup", "we_gave", "drop_off"];
  const idx = order.indexOf(current || "not_yet");
  return order[(idx + 1) % order.length];
}

function deliveryPill(value: string | null | undefined) {
  return DELIVERY_OPTIONS.find(o => o.value === (value || "not_yet")) || DELIVERY_OPTIONS[0];
}

interface BillingTabProps {
  productLines: ProductLine[];
  semenLines: SemenLine[];
  laborLines: LaborLine[];
  billingRecord: any;
  readOnly: boolean;
  onSaveProduct: (idx: number, updates: Partial<ProductLine>) => void;
  onSaveSemen: (idx: number, updates: Partial<SemenLine>) => void;
  onSaveBillingField: (field: string, value: any) => void;
  onSaveLabor: (idx: number, updates: Partial<LaborLine>) => void;
  onAddLabor: () => void;
  onDeleteLabor: (idx: number) => void;
  onAddProduct: (catalogProduct?: any) => void;
  onDeleteProduct: (idx: number) => void;
  onCloseOut: () => void;
  currentStatus: string;
  availableProducts: any[];
}

export default function BillingTab({
  productLines, semenLines, laborLines, billingRecord, readOnly,
  onSaveProduct, onSaveSemen, onSaveBillingField,
  onSaveLabor, onAddLabor, onDeleteLabor,
  onAddProduct, onDeleteProduct,
  onCloseOut, currentStatus, availableProducts,
}: BillingTabProps) {
  const [productPickerOpen, setProductPickerOpen] = React.useState(false);

  const productsByCategory = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const p of availableProducts || []) {
      const cat = p.product_category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    return groups;
  }, [availableProducts]);

  const categoryLabels: Record<string, string> = {
    gnrh: "GnRH",
    pgf: "PGF",
    cidr: "CIDR",
    patch: "Patches",
    supply: "Supplies",
    service: "Services",
    breeding_supply: "Breeding Supplies",
    sheath: "Sheaths",
    glove: "Gloves",
    gun_warmer: "Gun Warmers",
    ai_gun: "AI Guns",
    heat_detection: "Heat Detection",
    nutritional: "Nutritional",
    other: "Other",
  };
  const protocolLines = productLines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => !!line.protocol_event_label);
  const additionalLines = productLines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => !line.protocol_event_label);

  const productsTotal = productLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const semenTotal = semenLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
  const grandTotal = productsTotal + semenTotal;

  /* ── Product row ── */
  const renderProductRow = (line: ProductLine, idx: number, opts: { showStep: boolean; showDelete: boolean }) => {
    const pill = deliveryPill(line.delivery_method);
    return (
      <div key={line.id || idx} className="grid grid-cols-[1fr_110px_70px_80px_90px] items-center gap-3 py-2 border-b border-border/40 last:border-b-0">
        {/* Name + step */}
        <div className="min-w-0">
          {opts.showDelete && !readOnly ? (
            <div className="flex items-center gap-2">
              <Input
                className="h-7 text-sm"
                key={`name-${line.id}`}
                defaultValue={line.product_name ?? ""}
                onBlur={(e) => onSaveProduct(idx, { product_name: e.target.value })}
              />
              <button
                type="button"
                onClick={() => onDeleteProduct(idx)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                aria-label="Delete product"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="text-sm font-medium truncate">{line.product_name}</div>
          )}
          {opts.showStep && line.protocol_event_label && (
            <div className="text-xs text-muted-foreground truncate">{line.protocol_event_label}</div>
          )}
        </div>

        {/* Delivery pill */}
        <div>
          {readOnly ? (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${pill.className}`}>
              {pill.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onSaveProduct(idx, { delivery_method: nextDelivery(line.delivery_method) } as any)}
              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${pill.className}`}
            >
              {pill.label}
            </button>
          )}
        </div>

        {/* Qty */}
        <div className="text-right">
          {readOnly ? (
            <span className="text-sm">{line.units_billed ?? "—"}</span>
          ) : (
            <Input
              type="number" step="any"
              className="h-7 w-[64px] text-right text-xs ml-auto"
              key={`qty-${line.id}-${line.units_billed}`} defaultValue={line.units_billed ?? ""} placeholder="—"
              onBlur={(e) => onSaveProduct(idx, { units_billed: e.target.value === "" ? null : Number(e.target.value) })}
            />
          )}
        </div>

        {/* Price */}
        <div className="text-right">
          {readOnly ? (
            <span className="text-sm">{line.unit_price ? formatCurrency(line.unit_price) : "—"}</span>
          ) : (
            <Input
              type="number" step="any"
              className="h-7 w-[72px] text-right text-xs ml-auto"
              key={`price-${line.id}-${line.unit_price}`} defaultValue={line.unit_price ?? ""} placeholder="—"
              onBlur={(e) => onSaveProduct(idx, { unit_price: e.target.value === "" ? null : Number(e.target.value) })}
            />
          )}
        </div>

        {/* Total */}
        <div className="text-right text-sm font-medium">
          {(line.line_total ?? 0) > 0 ? formatCurrency(line.line_total) : "—"}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* ═══ SEMEN ═══ */}
      {semenLines.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Semen</h2>

          <div className="grid grid-cols-[1fr_60px_60px_70px_80px_80px_90px] gap-3 pb-2 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div>Bull</div>
            <div className="text-right">Pkd</div>
            <div className="text-right">Ret</div>
            <div className="text-right">Blown</div>
            <div className="text-right">Bill</div>
            <div className="text-right">Price</div>
            <div className="text-right">Total</div>
          </div>

          {semenLines.map((line, idx) => {
            return (
              <div key={line.id || idx} className="grid grid-cols-[1fr_60px_60px_70px_80px_80px_90px] items-center gap-3 py-2 border-b border-border/40 last:border-b-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {line.bull_name}
                    {line.bull_code && <span className="text-xs text-muted-foreground ml-1.5">{line.bull_code}</span>}
                  </div>
                  {line.semen_owner && (
                    <div className="text-xs text-amber-500 font-medium">{line.semen_owner}</div>
                  )}
                </div>
                <div className="text-right">
                  {readOnly ? (
                    <span className="text-xs text-muted-foreground">{line.units_packed || "—"}</span>
                  ) : (
                    <Input type="number" step="any" className="h-7 w-[52px] text-right text-xs ml-auto"
                      key={`packed-${line.id}-${line.units_packed}`} defaultValue={line.units_packed ?? ""} placeholder="—"
                      onBlur={(e) => onSaveSemen(idx, { units_packed: e.target.value === "" ? null : Number(e.target.value) })} />
                  )}
                </div>
                <div className="text-right">
                  {readOnly ? (
                    <span className="text-xs">{line.units_returned || "—"}</span>
                  ) : (
                    <Input type="number" step="any" className="h-7 w-[52px] text-right text-xs ml-auto"
                      key={`returned-${line.id}-${line.units_returned}`} defaultValue={line.units_returned ?? ""} placeholder="—"
                      onBlur={(e) => onSaveSemen(idx, { units_returned: e.target.value === "" ? null : Number(e.target.value) })} />
                  )}
                </div>
                <div className="text-right">
                  {readOnly ? (
                    <span className="text-sm">{line.units_blown ?? "—"}</span>
                  ) : (
                    <Input type="number" step="any" className="h-7 w-[60px] text-right text-xs ml-auto"
                      key={`blown-${line.id}-${line.units_blown}`} defaultValue={line.units_blown ?? ""} placeholder="—"
                      onBlur={(e) => onSaveSemen(idx, { units_blown: e.target.value === "" ? null : Number(e.target.value) })} />
                  )}
                </div>
                <div className="text-right">
                  {readOnly ? (
                    <span className="text-sm">{line.units_billable || "—"}</span>
                  ) : (
                    <Input type="number" step="any" className="h-7 w-[68px] text-right text-xs ml-auto"
                      key={`billable-${line.id}-${line.units_billable}`} defaultValue={line.units_billable ?? ""} placeholder="—"
                      onBlur={(e) => onSaveSemen(idx, { units_billable: e.target.value === "" ? null : Number(e.target.value) })} />
                  )}
                </div>
                <div className="text-right">
                  {readOnly ? (
                    <span className="text-sm">{line.unit_price ? formatCurrency(line.unit_price) : "—"}</span>
                  ) : (
                    <Input type="number" step="any" className="h-7 w-[68px] text-right text-xs ml-auto"
                      key={`sprice-${line.id}-${line.unit_price}`} defaultValue={line.unit_price ?? ""} placeholder="—"
                      onBlur={(e) => onSaveSemen(idx, { unit_price: e.target.value === "" ? null : Number(e.target.value) })} />
                  )}
                </div>
                <div className="text-right text-sm font-medium">{formatCurrency(line.line_total)}</div>
              </div>
            );
          })}

          <div className="flex justify-between items-baseline pt-3 mt-2 border-t border-border">
            <span className="text-sm font-medium text-muted-foreground">Semen</span>
            <span className="text-sm font-semibold">{formatCurrency(semenTotal)}</span>
          </div>
        </section>
      )}

      {/* ═══ PRODUCTS ═══ */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Products</h2>

        <div className="grid grid-cols-[1fr_110px_70px_80px_90px] gap-3 pb-2 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <div>Product</div>
          <div>Delivery</div>
          <div className="text-right">Qty</div>
          <div className="text-right">Price</div>
          <div className="text-right">Total</div>
        </div>

        {protocolLines.map(({ line, idx }) => renderProductRow(line, idx, { showStep: true, showDelete: false }))}
        {additionalLines.map(({ line, idx }) => renderProductRow(line, idx, { showStep: false, showDelete: true }))}

        {!readOnly && (
          <div className="pt-3">
            <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add product
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search products..." />
                  <CommandList>
                    <CommandEmpty>No products found.</CommandEmpty>
                    {Object.entries(productsByCategory).map(([cat, products]) => (
                      <CommandGroup key={cat} heading={categoryLabels[cat] || cat}>
                        {products.map((p: any) => (
                          <CommandItem
                            key={p.id}
                            value={`${p.product_name} ${cat}`}
                            onSelect={() => {
                              onAddProduct(p);
                              setProductPickerOpen(false);
                            }}
                          >
                            <div className="flex justify-between items-center w-full gap-2">
                              <span className="truncate">{p.product_name}</span>
                              {p.default_price > 0 && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  ${Number(p.default_price).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        value="custom product blank"
                        onSelect={() => {
                          onAddProduct();
                          setProductPickerOpen(false);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-2" /> Custom product
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="flex justify-between items-baseline pt-3 mt-2 border-t border-border">
          <span className="text-sm font-medium text-muted-foreground">Products</span>
          <span className="text-sm font-semibold">{formatCurrency(productsTotal)}</span>
        </div>
      </section>

      {/* ═══ LABOR & SERVICES ═══ */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Labor &amp; services</h2>

        {laborLines.length === 0 && readOnly && (
          <p className="text-sm text-muted-foreground">No labor entries.</p>
        )}

        <div className="space-y-2">
          {laborLines.map((line, idx) => (
            <div key={line.id || idx} className="flex items-start gap-3">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
                {readOnly ? (
                  <>
                    <span className="text-sm">{line.description || "—"}</span>
                    {line.labor_dates && <span className="text-sm text-muted-foreground">{line.labor_dates}</span>}
                  </>
                ) : (
                  <>
                    <Input
                      className="h-8 text-sm"
                      placeholder="What work did we do?"
                      key={`ldesc-${line.id}`}
                      defaultValue={line.description ?? ""}
                      onBlur={(e) => onSaveLabor(idx, { description: e.target.value })}
                    />
                    <Input
                      className="h-8 text-sm"
                      placeholder="Dates"
                      key={`ldate-${line.id}`}
                      defaultValue={line.labor_dates ?? ""}
                      onBlur={(e) => onSaveLabor(idx, { labor_dates: e.target.value })}
                    />
                  </>
                )}
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onDeleteLabor(idx)}
                  className="text-muted-foreground hover:text-destructive transition-colors mt-1.5 shrink-0"
                  aria-label="Delete labor entry"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {!readOnly && (
          <div className="pt-3">
            <button
              type="button"
              onClick={onAddLabor}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add labor entry
            </button>
          </div>
        )}
      </section>

      {/* ═══ NOTES ═══ */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Notes</h2>
        {readOnly ? (
          <p className="text-sm">
            {billingRecord?.notes || <span className="text-muted-foreground">No notes</span>}
          </p>
        ) : (
          <Textarea
            className="min-h-[80px] text-sm"
            defaultValue={billingRecord?.notes || ""}
            placeholder="Billing notes..."
            onBlur={(e) => onSaveBillingField("notes", e.target.value || null)}
          />
        )}
      </section>

      {/* ═══ CLOSE OUT ═══ */}
      <section className="rounded-lg bg-muted/30 p-5 space-y-4">
        <div className="flex justify-between items-baseline">
          <span className="text-lg font-medium">Grand total</span>
          <span className="text-2xl font-bold">{formatCurrency(grandTotal)}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">CATL invoice #</label>
            <Input
              className="mt-1 h-8 text-sm"
              defaultValue={billingRecord?.catl_invoice_number || ""}
              onBlur={(e) => onSaveBillingField("catl_invoice_number", e.target.value || null)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Select Sires invoice #</label>
            <Input
              className="mt-1 h-8 text-sm"
              defaultValue={billingRecord?.select_sires_invoice_number || ""}
              onBlur={(e) => onSaveBillingField("select_sires_invoice_number", e.target.value || null)}
            />
          </div>
        </div>

        {!readOnly && currentStatus !== "invoiced_closed" && (
          <>
            <Button className="w-full h-12 text-base font-semibold" onClick={onCloseOut}>
              Close out project
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Marks everything as invoiced and closes the project
            </p>
          </>
        )}

        {currentStatus === "invoiced_closed" && (
          <div className="text-center py-2">
            <span className="inline-flex items-center gap-2 text-emerald-600 font-semibold text-lg">
              ✓ Invoiced &amp; Closed
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
