import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Star, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import BreedSelect from "@/components/bulls/BreedSelect";
import { toast } from "@/hooks/use-toast";
import { useOrgRole } from "@/hooks/useOrgRole";

interface CatalogBull {
  id: string;
  bull_name: string;
  company: string;
  naab_code: string | null;
  is_custom?: boolean;
}

interface BullComboboxProps {
  value: string;
  catalogId: string | null;
  onChange: (value: string, catalogId: string | null, naabCode?: string | null) => void;
}

const BullCombobox = ({ value, catalogId, onChange }: BullComboboxProps) => {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CatalogBull[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastSentValue = useRef(value);
  const { orgId, userId } = useOrgRole();

  // Custom bull modal state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customForm, setCustomForm] = useState({ bull_name: "", naab_code: "", registration_number: "", breed: "", notes: "" });
  const [savingCustom, setSavingCustom] = useState(false);

  // Fetch user favorites on mount
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("bull_favorites")
        .select("bull_catalog_id")
        .eq("user_id", user.id);
      if (data) {
        setFavoriteIds(new Set(data.map((f) => f.bull_catalog_id).filter(Boolean) as string[]));
      }
    })();
  }, []);

  // Sync external value changes, but ignore the echo from our own onChange calls
  useEffect(() => {
    if (value !== lastSentValue.current) {
      setQuery(value);
      lastSentValue.current = value;
    }
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!query || query.length < 1) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from("bulls_catalog")
        .select("id, bull_name, company, naab_code, is_custom")
        .eq("active", true)
        .ilike("bull_name", `%${query}%`)
        .limit(20);
      const raw = (data ?? []) as CatalogBull[];
      // Sort: favorites first, then alphabetical
      raw.sort((a, b) => {
        const aFav = favoriteIds.has(a.id);
        const bFav = favoriteIds.has(b.id);
        if (aFav !== bFav) return aFav ? -1 : 1;
        return a.bull_name.localeCompare(b.bull_name);
      });
      setResults(raw);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, favoriteIds]);

  const handleSelect = (bull: CatalogBull) => {
    const displayName = bull.naab_code ? `${bull.bull_name} (${bull.naab_code})` : bull.bull_name;
    onChange(bull.bull_name, bull.id, bull.naab_code);
    setQuery(displayName);
    setOpen(false);
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    lastSentValue.current = val;
    onChange(val, null, null);
    setOpen(true);
  };

  const openCustomModal = () => {
    setCustomForm({ bull_name: query, naab_code: "", registration_number: "", breed: "", notes: "" });
    setShowCustomModal(true);
  };

  const handleSaveCustom = async () => {
    if (!customForm.bull_name.trim()) {
      toast({ title: "Bull name is required", variant: "destructive" });
      return;
    }
    if (!orgId || !userId) {
      toast({ title: "You must be logged in to an organization", variant: "destructive" });
      return;
    }
    setSavingCustom(true);
    try {
      const { data, error } = await supabase
        .from("bulls_catalog")
        .insert({
          bull_name: customForm.bull_name.trim(),
          naab_code: customForm.naab_code.trim() || null,
          registration_number: customForm.registration_number.trim() || "N/A",
          breed: customForm.breed.trim() || "Unknown",
          company: "Custom",
          is_custom: true,
          created_by: userId,
          organization_id: orgId,
          notes: customForm.notes.trim() || null,
        })
        .select("id, bull_name, company, naab_code, is_custom")
        .single();
      if (error) throw error;
      toast({ title: "Custom bull created" });
      setShowCustomModal(false);
      // Auto-select the new bull
      if (data) {
        handleSelect(data as CatalogBull);
      }
    } catch (err: any) {
      toast({ title: "Failed to create custom bull", description: err.message, variant: "destructive" });
    } finally {
      setSavingCustom(false);
    }
  };

  return (
    <>
      <div ref={wrapperRef} className="relative flex-1">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => query && setOpen(true)}
          placeholder="Search or type bull name..."
          aria-label="Search or enter bull name"
          aria-expanded={open}
          role="combobox"
          aria-autocomplete="list"
          className="h-9 w-full rounded-md border border-border bg-secondary px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {catalogId ? (
          <span
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-primary bg-primary/20 px-1.5 py-0.5 rounded"
            title="This bull is linked to your catalog."
          >
            Catalog
          </span>
        ) : query.trim().length > 0 ? (
          <span
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-amber-700 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded"
            title="This bull isn't in your catalog yet. Pick one from the dropdown or use 'Add custom bull' to save it."
          >
            Not linked
          </span>
        ) : null}
        {open && (results.length > 0 || query.trim().length > 0) && (
          <div
            className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto"
            role="listbox"
            aria-label="Bull search results"
          >
            {results.map((bull) => (
              <button
                key={bull.id}
                type="button"
                onClick={() => handleSelect(bull)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-secondary transition-colors text-left"
              >
                <span className="flex items-center gap-1.5 text-foreground">
                  {favoriteIds.has(bull.id) && (
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />
                  )}
                  {bull.bull_name}{bull.naab_code ? ` (${bull.naab_code})` : ""}
                  {bull.is_custom && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1 bg-muted text-muted-foreground">Custom</Badge>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{bull.company || "Custom"}</span>
              </button>
            ))}
            {query.trim().length > 0 && (
              <button
                type="button"
                onClick={openCustomModal}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-sm text-teal-400 hover:bg-secondary transition-colors text-left border-t border-border"
              >
                <Plus className="h-3.5 w-3.5" />
                Add custom bull: "{query.trim()}"
              </button>
            )}
          </div>
        )}
      </div>

      {/* Custom Bull Modal */}
      <Dialog open={showCustomModal} onOpenChange={setShowCustomModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Bull</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Bull Name *</Label>
              <Input
                value={customForm.bull_name}
                onChange={(e) => setCustomForm((p) => ({ ...p, bull_name: e.target.value }))}
                placeholder="Bull name"
              />
            </div>
            <div>
              <Label>NAAB Code</Label>
              <Input
                value={customForm.naab_code}
                onChange={(e) => setCustomForm((p) => ({ ...p, naab_code: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Registration Number</Label>
              <Input
                value={customForm.registration_number}
                onChange={(e) => setCustomForm((p) => ({ ...p, registration_number: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Breed</Label>
              <BreedSelect
                value={customForm.breed}
                onChange={(v) => setCustomForm((p) => ({ ...p, breed: v }))}
                placeholder="Select breed (optional)"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={customForm.notes}
                onChange={(e) => setCustomForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomModal(false)}>Cancel</Button>
            <Button onClick={handleSaveCustom} disabled={savingCustom}>
              {savingCustom ? "Saving…" : "Add Bull"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BullCombobox;
