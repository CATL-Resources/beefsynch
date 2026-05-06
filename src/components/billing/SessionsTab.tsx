import React, { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, ChevronRight, ChevronDown, Pencil, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import BreedingSection from "./BreedingSection";
import {
  ProductLine, SessionLine, SessionInventoryLine, SemenLine, BillingProduct,
  formatCurrency, isBreedingSession, toggleSetItem,
} from "./billingTypes";

interface SessionsTabProps {
  sessions: SessionLine[];
  productLines: ProductLine[];
  sessionInventory: SessionInventoryLine[];
  semenLines: SemenLine[];
  billingProducts: BillingProduct[];
  readOnly: boolean;
  onSaveSession: (idx: number, updates: Partial<SessionLine>) => void;
  onSaveProduct: (idx: number, updates: Partial<ProductLine>) => void;
  onSwapProduct: (idx: number, newProductId: string) => void;
  onToggleProductInvoiced: (idx: number) => void;
  onAddBreedingSession: () => void;
  onCreateCustomerPickup: () => void;
  onRemoveSession: (idx: number) => void;
  onRemoveProduct: (idx: number) => void;
  onAddProductToSession: (sessionId: string) => void;
  onAddProductToSessionWithProduct: (sessionId: string, productId: string) => void;
  onAddMiscProduct: (sessionId: string) => void;
  onSaveWorksheetCell: (rowId: string, field: "start_units" | "end_units" | "blown_units", value: number | null) => void;
  onSetSessionInventory: React.Dispatch<React.SetStateAction<SessionInventoryLine[]>>;
  onTotalUsedChanged: (totalUsed: number, bullUsed: Map<string, number>, bullBlown: Map<string, number>) => void;
}

export default function SessionsTab({
  sessions, productLines, sessionInventory, semenLines, billingProducts, readOnly,
  onSaveSession, onSaveProduct, onSwapProduct, onToggleProductInvoiced,
  onAddBreedingSession, onCreateCustomerPickup, onRemoveSession,
  onRemoveProduct, onAddProductToSession, onAddProductToSessionWithProduct,
  onAddMiscProduct,
  onSaveWorksheetCell, onSetSessionInventory, onTotalUsedChanged,
}: SessionsTabProps) {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [editingSessions, setEditingSessions] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => setExpandedSessions(p => toggleSetItem(p, id));
  const toggleEdit = (id: string) => setEditingSessions(p => toggleSetItem(p, id));

  const productsBySession = useMemo(() => {
    const map = new Map<string | null, ProductLine[]>();
    for (const p of productLines) { const k = p.session_id || null; if (!map.has(k)) map.set(k, []); map.get(k)!.push(p); }
    return map;
  }, [productLines]);

  const pickupSessions = useMemo(() =>
    sessions.filter(s => s.session_type === "customer_pickup")
      .sort((a, b) => a.session_date.localeCompare(b.session_date)), [sessions]);

  const eventSessions = useMemo(() =>
    sessions.filter(s => s.session_type !== "customer_pickup" && !isBreedingSession(s))
      .sort((a, b) => { const d = a.session_date.localeCompare(b.session_date); return d !== 0 ? d : (a.sort_order ?? 0) - (b.sort_order ?? 0); }),
    [sessions]);

  const breedingSessions = useMemo(() =>
    sessions.filter(s => isBreedingSession(s)), [sessions]);

  const fmtUnits = (line: ProductLine) => {
    if (!line.doses) return "—";
    return `${(line.units_billed ?? line.units_calculated ?? 0).toFixed(1)} ${line.unit_label || ""}`.trim();
  };

  const isManualOverride = (line: ProductLine) => {
    if (line.units_billed == null || line.units_calculated == null) return false;
    return Math.abs(line.units_billed - line.units_calculated) > 0.001;
  };

  function ProductPickerPopover({ sessionId, existingProductIds }: { sessionId: string; existingProductIds: Set<string> }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return billingProducts;
      return billingProducts.filter(p =>
        p.product_name.toLowerCase().includes(q) ||
        (p.product_category || "").toLowerCase().includes(q)
      );
    }, [query]);
    const grouped = useMemo(() => {
      const acc: Record<string, BillingProduct[]> = {};
      for (const p of filtered) {
        const k = p.product_category || "Uncategorized";
        if (!acc[k]) acc[k] = [];
        acc[k].push(p);
      }
      return Object.entries(acc).sort((a, b) => a[0].localeCompare(b[0]));
    }, [filtered]);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Add Product
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search products…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {grouped.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">No products found.</div>
            ) : grouped.map(([category, items]) => (
              <div key={category}>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {category}
                </div>
                {items.map(p => {
                  const already = existingProductIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onAddProductToSessionWithProduct(sessionId, p.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-muted/60 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{p.product_name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {p.unit_label ? `${p.unit_label} · ` : ""}
                          {p.default_price ? formatCurrency(p.default_price) : "—"}
                        </div>
                      </div>
                      {already && (
                        <Badge variant="outline" className="text-[9px] py-0 px-1 shrink-0">already added</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  function renderProductTable(sessionId: string, isEditing: boolean, products: ProductLine[], isPickup: boolean = false) {
    const existingProductIds = new Set<string>();
    for (const p of products) {
      if (p.billing_product_id) existingProductIds.add(p.billing_product_id);
    }
    return (
      <>
        {products.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Product / Service</TableHead>
                  <TableHead className="w-[80px] text-right">Head</TableHead>
                  <TableHead className="w-[100px] text-right">Units</TableHead>
                  <TableHead className="w-[90px] text-right">Price</TableHead>
                  <TableHead className="w-[100px] text-right">Total</TableHead>
                  {isEditing && <TableHead className="w-[40px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((line) => {
                  const idx = productLines.findIndex(p => p.id === line.id);
                  const catProds = isPickup
                    ? billingProducts
                    : billingProducts.filter(p => p.product_category === line.product_category);
                  const showSwap = isEditing && (isPickup ? billingProducts.length > 1 : catProds.length > 1);
                  const isMisc = !line.billing_product_id && line.product_category === null;
                  const groupedSwap = isPickup
                    ? Object.entries(
                        catProds.reduce((acc: Record<string, BillingProduct[]>, p: BillingProduct) => {
                          const k = p.product_category || "Uncategorized";
                          if (!acc[k]) acc[k] = [];
                          acc[k].push(p);
                          return acc;
                        }, {})
                      ).sort((a, b) => a[0].localeCompare(b[0]))
                    : [];
                  return (
                    <TableRow key={line.id || idx}>
                      <TableCell className="text-sm">
                        {isMisc ? (
                          <Input className="h-8 text-xs" value={line.product_name === "Miscellaneous" ? "" : line.product_name}
                            placeholder="What is this item?"
                            onChange={(e) => onSaveProduct(idx, { product_name: e.target.value || "Miscellaneous" })} />
                        ) : showSwap ? (
                          <Select value={line.billing_product_id || ""} onValueChange={(v) => onSwapProduct(idx, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue>{line.product_name}</SelectValue></SelectTrigger>
                            <SelectContent>
                              {isPickup ? (
                                groupedSwap.map(([category, items]) => (
                                  <React.Fragment key={category}>
                                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">{category}</div>
                                    {items.map(p => <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>)}
                                  </React.Fragment>
                                ))
                              ) : (
                                catProds.map(p => <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>)
                              )}
                            </SelectContent>
                          </Select>
                        ) : <span>{line.product_name}</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input type="number" className="h-8 w-[70px] text-right text-xs ml-auto" value={line.doses || ""} placeholder="—"
                            onChange={(e) => onSaveProduct(idx, { doses: Number(e.target.value) || 0 })} />
                        ) : <span className={`text-sm ${(line.doses ?? 0) > 0 ? "text-base font-bold text-emerald-700" : ""}`}>{line.doses || "—"}</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              step="0.1"
                              className="h-8 w-[80px] text-right text-xs ml-auto"
                              value={line.units_billed ?? ""}
                              placeholder={line.units_calculated != null ? line.units_calculated.toFixed(1) : "—"}
                              onChange={(e) => {
                                const v = e.target.value;
                                onSaveProduct(idx, { units_billed: v === "" ? null : Number(v) } as Partial<ProductLine>);
                              }}
                            />
                            {isManualOverride(line) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                title="Reset to auto-calculated units"
                                onClick={() => onSaveProduct(idx, { units_billed: line.units_calculated } as Partial<ProductLine>)}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className={`text-xs ${(line.units_billed ?? 0) > 0 ? "text-sm font-bold text-emerald-700" : ""}`}>{fmtUnits(line)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input type="number" step="0.01" className="h-8 w-[80px] text-right text-xs ml-auto" value={line.unit_price ?? ""} placeholder="—"
                            onChange={(e) => onSaveProduct(idx, { unit_price: Number(e.target.value) || 0 })} />
                        ) : <span className="text-sm">{line.unit_price ? formatCurrency(line.unit_price) : "—"}</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{line.line_total ? formatCurrency(line.line_total) : "—"}</TableCell>
                      {isEditing && (
                        <TableCell className="text-center p-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => onRemoveProduct(idx)}><Trash2 className="h-3 w-3" /></Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {isEditing && !readOnly && (
          <div className="flex gap-2 pt-1">
            {isPickup ? (
              <ProductPickerPopover sessionId={sessionId} existingProductIds={existingProductIds} />
            ) : (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddProductToSession(sessionId)}>
                <Plus className="h-3 w-3 mr-1" /> Add Product
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddMiscProduct(sessionId)}>
              <Plus className="h-3 w-3 mr-1" /> Add Misc
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Top buttons ── */}
      <div className="flex items-center justify-end">
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onCreateCustomerPickup}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Customer Pickup
            </Button>
          </div>
        )}
      </div>

      {/* ═══ Customer Pickup Cards ═══ */}
      {pickupSessions.map((s) => {
        const sessionIdx = sessions.findIndex(x => x.id === s.id);
        const sessionId = s.id || "";
        const isExpanded = expandedSessions.has(sessionId);
        const isEditing = editingSessions.has(sessionId);
        const prods = productsBySession.get(sessionId) || [];
        const total = prods.reduce((sum, p) => sum + (p.line_total ?? 0), 0);
        return (
          <Card key={sessionId} className="overflow-hidden border-amber-500/30">
            <button type="button" onClick={() => toggleExpand(sessionId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{format(parseISO(s.session_date), "MMM d, yyyy")}</span>
                <span className="text-sm text-muted-foreground">·</span>
                <span className="text-sm">Customer Pickup</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-500/40 text-amber-600">Pickup</Badge>
              </div>
              <div className="text-sm font-semibold tabular-nums shrink-0">{total ? formatCurrency(total) : "—"}</div>
            </button>
            {isExpanded && (
              <CardContent className="border-t pt-4 space-y-3">
                {!readOnly && (
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toggleEdit(sessionId)}>
                      {isEditing ? "Done" : <><Pencil className="h-3 w-3 mr-1" /> Edit</>}
                    </Button>
                  </div>
                )}
                {isEditing && (
                  <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                    <div>
                      <label className="text-muted-foreground">Pickup date</label>
                      <Input type="date" className="h-8 text-xs mt-1"
                        value={s.session_date || ""}
                        onChange={(e) => onSaveSession(sessionIdx, { session_date: e.target.value })} />
                    </div>
                  </div>
                )}
                {renderProductTable(sessionId, isEditing, prods, true)}
                {!readOnly && (
                  <div className="flex justify-end pt-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => onRemoveSession(sessionIdx)}><Trash2 className="h-3 w-3 mr-1" /> Remove pickup</Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* ═══ Protocol Event Cards ═══ */}
      {eventSessions.length > 0 && (
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">Protocol events</p>
      )}
      {eventSessions.map((s) => {
        const sessionIdx = sessions.findIndex(x => x.id === s.id);
        const sessionId = s.id || "";
        const isExpanded = expandedSessions.has(sessionId);
        const isEditing = editingSessions.has(sessionId);
        const isCustAdmin = s.session_type === "customer_administered";
        const prods = productsBySession.get(sessionId) || [];
        const total = prods.reduce((sum, p) => sum + (p.line_total ?? 0), 0);
        return (
          <Card key={sessionId} className={`overflow-hidden ${isCustAdmin ? "opacity-60" : ""}`}>
            <button type="button" onClick={() => toggleExpand(sessionId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{format(parseISO(s.session_date), "MMM d, yyyy")}</span>
                <span className="text-sm text-muted-foreground">·</span>
                <span className="text-sm">{s.session_label || "Session"}</span>
                {isCustAdmin && <Badge variant="outline" className="text-[10px] py-0 px-1.5">Customer did this</Badge>}
              </div>
              <div className="text-sm font-semibold tabular-nums shrink-0">
                {isCustAdmin ? "—" : (total ? formatCurrency(total) : "—")}
              </div>
            </button>
            {isExpanded && (
              <CardContent className="border-t pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  {!readOnly && (
                    <button type="button"
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                        isCustAdmin
                          ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                          : "text-muted-foreground border-border hover:border-amber-500/30 hover:text-amber-600"
                      }`}
                      onClick={() => onSaveSession(sessionIdx, {
                        session_type: isCustAdmin ? "field_session" : "customer_administered"
                      } as any)}>
                      {isCustAdmin ? "✓ Customer did this" : "Customer did this"}
                    </button>
                  )}
                  {!readOnly && !isCustAdmin && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toggleEdit(sessionId)}>
                      {isEditing ? "Done" : <><Pencil className="h-3 w-3 mr-1" /> Edit</>}
                    </Button>
                  )}
                </div>

                {isCustAdmin ? (
                  <p className="text-sm text-muted-foreground italic">Customer administered — no billable products.</p>
                ) : (
                  <>
                    {isEditing && !isCustAdmin && (
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="text-muted-foreground">Date</label>
                          <Input type="date" className="h-8 text-xs mt-1"
                            value={s.session_date || ""}
                            onChange={(e) => onSaveSession(sessionIdx, { session_date: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-muted-foreground">Label</label>
                          <Input className="h-8 text-xs mt-1"
                            value={s.session_label || ""}
                            placeholder="e.g. Timed Breeding"
                            onChange={(e) => onSaveSession(sessionIdx, { session_label: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-muted-foreground">Time</label>
                          <Input className="h-8 text-xs mt-1"
                            value={s.time_of_day || ""}
                            placeholder="e.g. 7:00 AM"
                            onChange={(e) => onSaveSession(sessionIdx, { time_of_day: e.target.value })} />
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-muted-foreground">Crew</label>
                        {isEditing ? <Input className="h-8 text-xs mt-1" value={s.crew || ""} placeholder="—"
                          onChange={(e) => onSaveSession(sessionIdx, { crew: e.target.value })} />
                          : <p className="mt-1 font-medium">{s.crew || "—"}</p>}
                      </div>
                      <div>
                        <label className="text-muted-foreground">Notes</label>
                        {isEditing ? <Input className="h-8 text-xs mt-1" value={s.notes || ""} placeholder="—"
                          onChange={(e) => onSaveSession(sessionIdx, { notes: e.target.value })} />
                          : <p className="mt-1 font-medium">{s.notes || "—"}</p>}
                      </div>
                    </div>
                    {prods.length > 0 || isEditing ? renderProductTable(sessionId, isEditing, prods)
                      : <p className="text-xs text-muted-foreground italic">No products on this session.</p>}
                  </>
                )}
                {isEditing && !readOnly && !isCustAdmin && (
                  <div className="flex justify-end pt-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => onRemoveSession(sessionIdx)}><Trash2 className="h-3 w-3 mr-1" /> Remove session</Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* ═══ Breeding Section ═══ */}
      {(breedingSessions.length > 0 || semenLines.length > 0) && (
        <>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-4">Breeding</p>
          <BreedingSection
            sessions={breedingSessions} allSessions={sessions}
            productLines={productLines} sessionInventory={sessionInventory}
            semenLines={semenLines} billingProducts={billingProducts} readOnly={readOnly}
            onSaveSession={onSaveSession} onSaveProduct={onSaveProduct}
            onSwapProduct={onSwapProduct} onRemoveProduct={onRemoveProduct}
            onAddProductToSession={onAddProductToSession}
            onAddBreedingSession={onAddBreedingSession} onRemoveSession={onRemoveSession}
            onSaveWorksheetCell={onSaveWorksheetCell} onSetSessionInventory={onSetSessionInventory}
            onTotalUsedChanged={onTotalUsedChanged}
          />
        </>
      )}

      {/* Unassigned products fallback */}
      {(productsBySession.get(null)?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Unassigned products</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-[100px]">Date</TableHead><TableHead>Product</TableHead>
                  <TableHead className="w-[80px] text-right">Head</TableHead><TableHead className="w-[100px] text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(productsBySession.get(null) || []).map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="text-xs">{line.event_date ? format(parseISO(line.event_date), "MMM d") : "—"}</TableCell>
                      <TableCell className="text-sm">{line.product_name}</TableCell>
                      <TableCell className="text-right text-sm">
                        <span className={(line.doses ?? 0) > 0 ? "text-base font-bold text-emerald-700" : ""}>{line.doses || "—"}</span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{line.line_total ? formatCurrency(line.line_total) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
