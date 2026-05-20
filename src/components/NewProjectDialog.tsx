import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { calculateProtocolEvents } from "@/lib/protocolEvents";
import CustomerPicker from "@/components/CustomerPicker";
import BullCombobox from "@/components/BullCombobox";
import BullsRowManager from "@/components/BullsRowManager";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const cowProtocols = [
  "Select Synch CIDR",
  "Select Synch TOO",
  "Select Synch",
  "7&7 Synch",
];

const heiferProtocols = [
  "7 Day CIDR",
  "7&7 Synch",
  "MGA",
  "14 Day CIDR",
];

const formSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(200),
  customer_id: z.string().uuid({ message: "Customer is required" }),
  cattle_type: z.enum(["Heifers", "Cows"]),
  protocol: z.string().min(1, "Protocol is required"),
  head_count: z.coerce.number().int().min(1, "Must be at least 1"),
  breeding_date: z.date({ required_error: "Breeding date is required" }),
  breeding_time: z.string().default("10:00"),
  status: z.enum(["Tentative", "Confirmed", "In Field", "Ready to Bill", "Invoiced"]).default("Tentative"),
  notes: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface BullRow {
  name: string;
  catalogId: string | null;
  units: number;
  semenSource?: "company" | "customer";
}

interface EditProjectData {
  id: string;
  name: string;
  customer_id: string;
  cattle_type: string;
  protocol: string;
  head_count: number;
  breeding_date: string | null;
  breeding_time: string | null;
  status: string;
  notes: string | null;
  last_contacted_date?: string | null;
  last_contacted_by?: string | null;
  bulls: { name: string; catalogId: string | null; units: number; semenSource?: "company" | "customer" }[];
}

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: () => void;
  editData?: EditProjectData | null;
}

const NewProjectDialog = ({ open, onOpenChange, onProjectCreated, editData }: NewProjectDialogProps) => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [bulls, setBulls] = useState<BullRow[]>([]);
  const [breedingDatePopoverOpen, setBreedingDatePopoverOpen] = useState(false);
  const isEditing = !!editData;

  // Organization selection
  const [userOrgs, setUserOrgs] = useState<{ id: string; name: string }[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || user.is_anonymous) {
        setUserOrgs([]);
        setSelectedOrgId(null);
        return;
      }
      const { data } = await supabase
        .from("organization_members")
        .select("organization_id, organizations!organization_members_organization_id_fkey(id, name)")
        .eq("user_id", user.id)
        .eq("accepted", true);
      if (data && data.length > 0) {
        const orgs = data
          .map((d: any) => d.organizations)
          .filter(Boolean)
          .map((o: any) => ({ id: o.id, name: o.name }));
        setUserOrgs(orgs);
        setSelectedOrgId(orgs[0]?.id ?? null);
      } else {
        setUserOrgs([]);
        setSelectedOrgId(null);
      }
    });
  }, [open]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      customer_id: undefined as unknown as string,
      cattle_type: "Heifers",
      protocol: "",
      head_count: undefined as unknown as number,
      breeding_time: "10:00",
      status: "Tentative",
      notes: "",
    },
  });

  // Pre-fill form when editing
  useEffect(() => {
    if (editData && open) {
      form.reset({
        name: editData.name,
        customer_id: editData.customer_id,
        cattle_type: editData.cattle_type as "Heifers" | "Cows",
        protocol: editData.protocol,
        head_count: editData.head_count,
        breeding_date: editData.breeding_date ? new Date(editData.breeding_date + "T12:00:00") : undefined,
        breeding_time: editData.breeding_time?.slice(0, 5) || "10:00",
        status: editData.status as "Tentative" | "Confirmed" | "In Field" | "Ready to Bill" | "Invoiced",
        notes: editData.notes || "",
      });
      setBulls(editData.bulls);
    } else if (!editData && open) {
      form.reset();
      setBulls([]);
    }
  }, [editData, open]);

  useEffect(() => {
    if (!open) setBreedingDatePopoverOpen(false);
  }, [open]);

  const cattleType = form.watch("cattle_type");
  const protocol = form.watch("protocol");
  const breedingDate = form.watch("breeding_date");
  const breedingTime = form.watch("breeding_time");

  const protocols = cattleType === "Cows" ? cowProtocols : heiferProtocols;

  const previewEvents = useMemo(() => {
    if (!protocol || !breedingDate || !breedingTime) return [];
    return calculateProtocolEvents(protocol, cattleType, breedingDate, breedingTime);
  }, [protocol, cattleType, breedingDate, breedingTime]);

  const handleCattleTypeChange = (type: "Heifers" | "Cows") => {
    form.setValue("cattle_type", type);
    form.setValue("protocol", "");
  };

  const addBullRow = () => setBulls((prev) => [...prev, { name: "", catalogId: null, units: 0 }]);

  const removeBullRow = (index: number) => setBulls((prev) => prev.filter((_, i) => i !== index));

  const updateBull = (index: number, name: string, catalogId: string | null) => {
    setBulls((prev) => prev.map((b, i) => (i === index ? { ...b, name, catalogId } : b)));
  };

  const updateBullUnits = (index: number, units: number) => {
    setBulls((prev) => prev.map((b, i) => (i === index ? { ...b, units } : b)));
  };

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      // Silently retrieve the authenticated user — abort if not found
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSaving(false);
        toast({ title: "Not authenticated", description: "Please sign in to create a project.", variant: "destructive" });
        onOpenChange(false);
        navigate("/auth");
        return;
      }

      const projectPayload: Record<string, any> = {
        name: values.name,
        customer_id: values.customer_id,
        cattle_type: values.cattle_type,
        protocol: values.protocol,
        head_count: values.head_count,
        breeding_date: format(values.breeding_date, "yyyy-MM-dd"),
        breeding_time: values.breeding_time,
        status: values.status,
        notes: values.notes || null,
        user_id: user.id,
      };

      // Preserve last_contacted fields when editing
      if (isEditing && editData) {
        if (editData.last_contacted_date !== undefined) {
          projectPayload.last_contacted_date = editData.last_contacted_date;
        }
        if (editData.last_contacted_by !== undefined) {
          projectPayload.last_contacted_by = editData.last_contacted_by;
        }
      }

      // Attach organization if available
      if (selectedOrgId) {
        projectPayload.organization_id = selectedOrgId;
      }

      let projectId: string;

      if (isEditing && editData) {
        // Update existing project
        const { error } = await supabase.from("projects").update(projectPayload as any).eq("id", editData.id);
        if (error) throw error;
        projectId = editData.id;

        // Delete old events, then re-insert
        const { error: delSyncErr } = await supabase.from("google_calendar_events").delete().eq("project_id", projectId);
        if (delSyncErr) console.error("Failed to clean up calendar sync records:", delSyncErr);
        const { error: delErr } = await supabase.from("protocol_events").delete().eq("project_id", projectId);
        if (delErr) throw delErr;

        // Delete old bulls, then re-insert
        const { error: delBullErr } = await supabase.from("project_bulls").delete().eq("project_id", projectId);
        if (delBullErr) throw delBullErr;
      } else {
        // Insert new project
        const { data: project, error } = await supabase.from("projects").insert(projectPayload as any).select("id").single();
        if (error) throw error;
        projectId = project.id;
      }

      // Insert protocol events
      const events = calculateProtocolEvents(values.protocol, values.cattle_type, values.breeding_date, values.breeding_time);
      if (events.length > 0) {
        const rows = events.map((e) => ({
          project_id: projectId,
          event_name: e.event_name,
          event_date: e.event_date,
          event_time: e.event_time,
        }));
        const { error: evError } = await supabase.from("protocol_events").insert(rows);
        if (evError) throw evError;
      }

      // Insert project bulls
      const validBulls = bulls.filter((b) => b.name.trim());
      if (validBulls.length > 0) {
        const bullRows = validBulls.map((b) => ({
          project_id: projectId,
          bull_catalog_id: b.catalogId,
          custom_bull_name: b.catalogId ? null : b.name.trim(),
          units: b.units,
          semen_source: b.semenSource ?? "company",
        }));
        const { error: bullError } = await supabase.from("project_bulls").insert(bullRows);
        if (bullError) throw bullError;
      }

      toast({ title: isEditing ? "Project updated" : "Project created", description: `"${values.name}" has been saved.` });
      form.reset();
      setBulls([]);
      onOpenChange(false);
      onProjectCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{isEditing ? "Edit Breeding Project" : "New Breeding Project"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Organization selector (only if multiple orgs) */}
            {userOrgs.length > 1 && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Organization</label>
                <Select value={selectedOrgId ?? ""} onValueChange={setSelectedOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {userOrgs.map((org) => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Customer (required) */}
            <FormField control={form.control} name="customer_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Customer <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <CustomerPicker
                    value={field.value || null}
                    onChange={(customerId) => field.onChange(customerId)}
                    orgId={selectedOrgId || ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Project Name */}
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Project Name</FormLabel>
                <FormControl><Input placeholder="e.g. Spring Heifer Group A" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Cattle Type Toggle */}
            <FormField control={form.control} name="cattle_type" render={({ field }) => (
              <FormItem>
                <FormLabel>Cattle Type</FormLabel>
                <div className="flex rounded-md border border-border bg-secondary p-0.5">
                  {(["Heifers", "Cows"] as const).map((type) => (
                    <button key={type} type="button" onClick={() => handleCattleTypeChange(type)}
                      className={cn("flex-1 rounded px-4 py-2 text-sm font-medium transition-colors",
                        field.value === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}>
                      {type}
                    </button>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )} />

            {/* Protocol */}
            <FormField control={form.control} name="protocol" render={({ field }) => (
              <FormItem>
                <FormLabel>Protocol</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select a protocol" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {protocols.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {/* Head Count & Status */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="head_count" render={({ field }) => (
                <FormItem>
                  <FormLabel>Head Count</FormLabel>
                  <FormControl><Input type="number" min={1} placeholder="Head count" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {["Tentative", "Confirmed", "In Field", "Ready to Bill"].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                      {field.value === "Invoiced" && (
                        <SelectItem value="Invoiced" disabled>Invoiced</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Breeding Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="breeding_date" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Breeding Date</FormLabel>
                  <Popover open={breedingDatePopoverOpen} onOpenChange={setBreedingDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={(d) => { field.onChange(d); setBreedingDatePopoverOpen(false); }} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="breeding_time" render={({ field }) => (
                <FormItem>
                  <FormLabel>Breeding Time</FormLabel>
                  <FormControl><Input type="time" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Protocol Events Preview */}
            {previewEvents.length > 0 && (
              <div className="rounded-lg border border-border bg-secondary/50 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground font-display">Protocol Schedule Preview</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-1.5 text-left text-muted-foreground font-medium">Event</th>
                      <th className="py-1.5 text-left text-muted-foreground font-medium">Date</th>
                      <th className="py-1.5 text-left text-muted-foreground font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewEvents.map((ev, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1.5 text-foreground">{ev.event_name}</td>
                        <td className="py-1.5 text-muted-foreground">{format(new Date(ev.event_date + "T12:00:00"), "MMM d, yyyy")}</td>
                        <td className="py-1.5 text-muted-foreground">{ev.event_time ? format(new Date(`2000-01-01T${ev.event_time}`), "h:mm a") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Bulls & Semen */}
            <BullsRowManager
              bulls={bulls.map((b) => ({
                bull_name: b.name,
                bull_catalog_id: b.catalogId,
                units: b.units,
              }))}
              onAdd={addBullRow}
              onRemove={removeBullRow}
              onUpdateBull={updateBull}
              onUpdateUnits={updateBullUnits}
              showUnits={true}
              showInventory={true}
              orgId={selectedOrgId}
            />

            {/* Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea placeholder="Optional notes..." rows={3} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : isEditing ? "Update Project" : "Save Project"}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default NewProjectDialog;
