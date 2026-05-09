import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import BreedSelect from "@/components/bulls/BreedSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export interface CompanyOption {
  id: string;
  name: string;
}

export interface OfferingDraft {
  company_id: string;
  company_name: string;
  company_naab_code: string;
  is_primary: boolean;
}

export interface BullFormData {
  bull_name: string;
  naab_code: string;
  registration_number: string;
  breed: string;
  notes: string;
  offerings: OfferingDraft[];
}

interface AddEditBullDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  formData: BullFormData;
  onFormChange: (data: Partial<BullFormData>) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  allCompanies: CompanyOption[];
}

export default function AddEditBullDialog({
  open,
  onOpenChange,
  mode,
  formData,
  onFormChange,
  onSave,
  saving,
  allCompanies,
}: AddEditBullDialogProps) {
  const offerings = formData.offerings || [];

  const findOffering = (companyId: string) =>
    offerings.find((o) => o.company_id === companyId);

  const toggleCompany = (company: CompanyOption, checked: boolean) => {
    let next: OfferingDraft[];
    if (checked) {
      if (findOffering(company.id)) return;
      next = [
        ...offerings,
        {
          company_id: company.id,
          company_name: company.name,
          company_naab_code: formData.naab_code || "",
          is_primary: false,
        },
      ];
    } else {
      next = offerings.filter((o) => o.company_id !== company.id);
    }
    // Auto-set primary if exactly one and none yet primary
    const hasPrimary = next.some((o) => o.is_primary);
    if (next.length === 1 && !hasPrimary) {
      next = next.map((o) => ({ ...o, is_primary: true }));
    }
    // If we removed the primary, clear all (force re-pick)
    if (!checked && !next.some((o) => o.is_primary) && next.length > 1) {
      next = next.map((o) => ({ ...o, is_primary: false }));
    }
    onFormChange({ offerings: next });
  };

  const setPrimary = (companyId: string) => {
    const next = offerings.map((o) => ({
      ...o,
      is_primary: o.company_id === companyId,
    }));
    onFormChange({ offerings: next });
  };

  const setNaab = (companyId: string, value: string) => {
    const next = offerings.map((o) =>
      o.company_id === companyId ? { ...o, company_naab_code: value } : o,
    );
    onFormChange({ offerings: next });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit Bull" : "Add Bull"}</DialogTitle>
          <DialogDescription>
            {mode === "edit" ? "Update bull details below." : "Enter bull details below."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[140px_1fr] items-center gap-x-4 gap-y-3">
            <Label className="text-right">Bull Name *</Label>
            <Input
              value={formData.bull_name}
              onChange={(e) => onFormChange({ bull_name: e.target.value })}
              placeholder="Bull name"
            />

            <Label className="text-right">NAAB Code</Label>
            <Input
              value={formData.naab_code}
              onChange={(e) => onFormChange({ naab_code: e.target.value })}
              placeholder="Optional — bull's main NAAB"
            />

            <Label className="text-right">Reg. Number</Label>
            <Input
              value={formData.registration_number}
              onChange={(e) => onFormChange({ registration_number: e.target.value })}
              placeholder="Optional"
            />

            <Label className="text-right">Breed</Label>
            <BreedSelect
              value={formData.breed}
              onChange={(v) => onFormChange({ breed: v })}
              placeholder="Select breed (optional)"
            />

            <Label className="text-right self-start pt-2">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => onFormChange({ notes: e.target.value })}
              placeholder="Optional"
              rows={2}
            />
          </div>

          {/* Available From multi-select */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Available From</Label>
              <span className="text-xs text-muted-foreground">
                {offerings.length === 0
                  ? "No companies — bull will be saved as Custom"
                  : `${offerings.length} company${offerings.length !== 1 ? "ies" : ""} selected`}
              </span>
            </div>
            <div className="border rounded-md max-h-[240px] overflow-y-auto divide-y">
              {allCompanies.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">
                  No active companies found.
                </div>
              )}
              {allCompanies.map((company) => {
                const offering = findOffering(company.id);
                const checked = !!offering;
                return (
                  <div
                    key={company.id}
                    className="p-2.5 flex items-center gap-3 flex-wrap"
                  >
                    <div className="flex items-center gap-2 min-w-[180px] flex-1">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleCompany(company, !!v)}
                        id={`co-${company.id}`}
                      />
                      <label
                        htmlFor={`co-${company.id}`}
                        className="text-sm cursor-pointer"
                      >
                        {company.name}
                      </label>
                    </div>
                    {checked && (
                      <>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="radio"
                            name="primary-offering"
                            checked={!!offering?.is_primary}
                            onChange={() => setPrimary(company.id)}
                          />
                          Primary
                        </label>
                        <Input
                          className="h-8 w-32 text-xs"
                          placeholder="NAAB"
                          value={offering?.company_naab_code || ""}
                          onChange={(e) => setNaab(company.id, e.target.value)}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {offerings.length > 1 && !offerings.some((o) => o.is_primary) && (
              <p className="text-xs text-destructive">
                Pick a primary company before saving.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : mode === "edit" ? "Save Changes" : "Add Bull"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
