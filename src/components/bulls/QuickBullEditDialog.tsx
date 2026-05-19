import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BreedSelect from "@/components/bulls/BreedSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface QuickBullEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bullCatalogId: string;
}

export default function QuickBullEditDialog({
  open,
  onOpenChange,
  bullCatalogId,
}: QuickBullEditDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bullName, setBullName] = useState("");
  const [naabCode, setNaabCode] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [breed, setBreed] = useState("");

  useEffect(() => {
    if (!open || !bullCatalogId) return;
    setLoading(true);
    supabase
      .from("bulls_catalog")
      .select("bull_name, naab_code, registration_number, breed")
      .eq("id", bullCatalogId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error("Could not load bull details");
          onOpenChange(false);
          return;
        }
        setBullName(data.bull_name || "");
        setNaabCode(data.naab_code || "");
        setRegNumber(data.registration_number || "");
        setBreed(data.breed || "");
        setLoading(false);
      });
  }, [open, bullCatalogId]);

  const handleSave = async () => {
    if (!bullName.trim()) {
      toast.error("Bull name is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("bulls_catalog")
      .update({
        bull_name: bullName.trim(),
        naab_code: naabCode.trim() || null,
        registration_number: regNumber.trim() || null,
        breed: breed.trim() || null,
      })
      .eq("id", bullCatalogId);
    setSaving(false);
    if (error) {
      toast.error("Failed to update bull: " + error.message);
      return;
    }
    toast.success("Bull updated");
    queryClient.invalidateQueries({ queryKey: ["tank_inventory"] });
    queryClient.invalidateQueries({ queryKey: ["pack_lines"] });
    queryClient.invalidateQueries({ queryKey: ["order_detail"] });
    queryClient.invalidateQueries({ queryKey: ["bull_catalog"] });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["tank_map"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit Bull</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-3">
            <Label className="text-right">Name</Label>
            <Input value={bullName} onChange={(e) => setBullName(e.target.value)} placeholder="Bull name" />
            <Label className="text-right">NAAB Code</Label>
            <Input value={naabCode} onChange={(e) => setNaabCode(e.target.value)} placeholder="e.g. 7AN580" />
            <Label className="text-right">Reg #</Label>
            <Input value={regNumber} onChange={(e) => setRegNumber(e.target.value)} placeholder="Registration number" />
            <Label className="text-right">Breed</Label>
            <BreedSelect value={breed} onChange={setBreed} placeholder="Select breed (optional)" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
