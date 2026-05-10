import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Calendar, FileDown, FileText, Download, Pencil, MoreVertical, Star, Trash2, UserCheck, ExternalLink, Loader2, Plus, Package, ClipboardList } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useOrgRole } from "@/hooks/useOrgRole";
import NewProjectDialog from "@/components/NewProjectDialog";
import QuickBullEditDialog from "@/components/bulls/QuickBullEditDialog";
import CustomerPicker from "@/components/CustomerPicker";
import { generateProjectPdf } from "@/lib/generateProjectPdf";
import { generateProjectCsv } from "@/lib/generateProjectCsv";
import { printBreedingWorksheet } from "@/lib/printBreedingWorksheet";
import { getBullDisplayName } from "@/lib/bullDisplay";
import { buildProjectIcsEvents, generateIcsFile, downloadIcsFile } from "@/lib/generateIcs";
import {
  pushEventsToGoogleCalendar,
  removeEventsFromGoogleCalendar,
  isGoogleCalendarConfigured,
  isGoogleCalendarConfiguredAsync,
  getGoogleAccessToken,
  listGoogleCalendars,
  type CalendarEventInput,
  type GoogleCalendarInfo,
} from "@/lib/googleCalendar";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import ClickableRegNumber from "@/components/ClickableRegNumber";
import { useBullFavorites } from "@/hooks/useBullFavorites";
import { formatTime12, isNoTimeEvent } from "@/lib/formatUtils";
import { statusColor } from "@/lib/badgeStyles";

interface ProjectRow {
  id: string;
  name: string;
  customer_id: string | null;
  customers: { name: string } | { name: string }[] | null;
  cattle_type: string;
  protocol: string;
  head_count: number;
  breeding_date: string | null;
  breeding_time: string | null;
  status: string;
  notes: string | null;
  user_id: string | null;
  last_contacted_date: string | null;
  last_contacted_by: string | null;
}

interface OrgMember {
  id: string;
  user_id: string | null;
  email: string | null;
}

interface EventRow {
  id: string;
  event_name: string;
  event_date: string;
  event_time: string | null;
}

interface BullRow {
  id: string;
  units: number;
  custom_bull_name: string | null;
  bull_catalog_id: string | null;
  semen_source: "company" | "customer";
  bulls_catalog: { bull_name: string; company: string; registration_number: string; breed: string } | null;
}

const ProjectDetail = () => {
  const { favoritedIds, toggleFavorite } = useBullFavorites();
  const { role: orgRole, userId, orgId } = useOrgRole();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [bulls, setBulls] = useState<BullRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editBullId, setEditBullId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Contact history state
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactEditing, setContactEditing] = useState(false);
  const [contactDate, setContactDate] = useState<Date | undefined>(undefined);
  const [contactBy, setContactBy] = useState<string>("");
  const [contactNotes, setContactNotes] = useState<string>("");
  const [contactSaving, setContactSaving] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Google Calendar state
  const [pushing, setPushing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarInfo[]>([]);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [orgGoogleCalendarId, setOrgGoogleCalendarId] = useState<string | null>(null);
  const [googleCalendarConfigured, setGoogleCalendarConfigured] = useState(isGoogleCalendarConfigured());
  const [customerEditOpen, setCustomerEditOpen] = useState(false);
  const [activePacks, setActivePacks] = useState<{ pack_id: string; status: string; tank_name: string | null; tank_number: string | number }[]>([]);
  const [hasActiveBilling, setHasActiveBilling] = useState(false);

  // Fetch org members for the contact dropdown
  const fetchOrgMembers = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase.rpc("get_org_members", { _organization_id: orgId });
    if (data) {
      setOrgMembers(
        (data)
          .filter((m: any) => m.accepted && m.user_id)
          .map((m: any) => ({ id: m.id, user_id: m.user_id, email: m.email }))
      );
    }
  }, [orgId]);

  useEffect(() => {
    fetchOrgMembers();
  }, [fetchOrgMembers]);

  // Fetch org's saved Google Calendar ID
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("organizations")
      .select("google_calendar_id")
      .eq("id", orgId)
      .single()
      .then(({ data }) => {
        if (data?.google_calendar_id) {
          setOrgGoogleCalendarId(data.google_calendar_id);
        }
      });
  }, [orgId]);

  const resolveContactEmail = (uid: string | null): string => {
    if (!uid) return "Unknown user";
    const member = orgMembers.find((m) => m.user_id === uid);
    return member?.email ?? "Unknown user";
  };

  const fetchContacts = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("project_contacts")
      .select("*")
      .eq("project_id", id)
      .order("contact_date", { ascending: false });
    setContacts(data ?? []);
  }, [id]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleQuickLog = () => {
    setContactDate(new Date());
    setContactBy(userId ?? "");
    setContactNotes("");
    setContactEditing(true);
  };

  const handleContactSave = async () => {
    if (!project || !contactDate || !contactBy || !orgId) return;
    setContactSaving(true);
    const dateStr = format(contactDate, "yyyy-MM-dd");
    try {
      // Insert into project_contacts
      const { error: insertErr } = await supabase
        .from("project_contacts")
        .insert({
          project_id: project.id,
          organization_id: orgId,
          contact_date: dateStr,
          contacted_by: contactBy,
          notes: contactNotes.trim() || null,
        });
      if (insertErr) {
        toast({ title: "Could not log contact", description: insertErr.message, variant: "destructive" });
        setContactSaving(false);
        return;
      }
      // Also update the projects table for backward compat
      const { error: updateErr } = await supabase
        .from("projects")
        .update({ last_contacted_date: dateStr, last_contacted_by: contactBy })
        .eq("id", project.id);
      if (updateErr) {
        toast({ title: "Partial failure", description: "Contact logged but failed to update project. Please refresh.", variant: "destructive" });
        setContactSaving(false);
        return;
      }
      setProject((p) => p ? { ...p, last_contacted_date: dateStr, last_contacted_by: contactBy } : p);
      await fetchContacts();
      setContactEditing(false);
      setContactNotes("");
      toast({ title: "Contact logged" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to log contact", variant: "destructive" });
    } finally {
      setContactSaving(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    const { error } = await supabase.from("project_contacts").delete().eq("id", contactId);
    if (error) {
      toast({ title: "Could not delete", description: error.message, variant: "destructive" });
      return;
    }
    // After deleting, update the project's last_contacted fields
    const remaining = contacts.filter((c) => c.id !== contactId);
    if (remaining.length > 0) {
      const latest = remaining[0]; // already sorted desc
      await supabase
        .from("projects")
        .update({ last_contacted_date: latest.contact_date, last_contacted_by: latest.contacted_by })
        .eq("id", project!.id);
      setProject((p) => p ? { ...p, last_contacted_date: latest.contact_date, last_contacted_by: latest.contacted_by } : p);
    } else {
      await supabase
        .from("projects")
        .update({ last_contacted_date: null, last_contacted_by: null })
        .eq("id", project!.id);
      setProject((p) => p ? { ...p, last_contacted_date: null, last_contacted_by: null } : p);
    }
    await fetchContacts();
    toast({ title: "Contact entry deleted" });
  };

  const startContactEdit = () => {
    setContactDate(new Date());
    setContactBy(userId ?? "");
    setContactNotes("");
    setContactEditing(true);
  };

  const load = async () => {
    if (!id) return;
    try {
      const [pRes, eRes, bRes, packRes, billRes] = await Promise.all([
        supabase.from("projects").select("*, customers!projects_customer_id_fkey(name)").eq("id", id).single(),
        supabase
          .from("protocol_events")
          .select("*")
          .eq("project_id", id)
          .order("event_date", { ascending: true }),
        supabase
          .from("project_bulls")
          .select("*, bulls_catalog(bull_name, company, registration_number, breed)")
          .eq("project_id", id),
        supabase
          .from("tank_pack_projects")
          .select("tank_pack_id, tank_packs!inner(id, status, tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number))")
          .eq("project_id", id),
        supabase
          .from("project_billing_semen")
          .select("units_packed, units_blown, units_billable")
          .eq("project_id", id),
      ]);

      if (pRes.data) setProject(pRes.data as unknown as ProjectRow);
      if (eRes.data) setEvents(eRes.data as EventRow[]);
      if (bRes.data) setBulls(bRes.data as BullRow[]);

      const packs = ((packRes.data ?? []) as any[])
        .map((row) => row.tank_packs)
        .filter((tp: any) => tp && !["cancelled", "unpacked", "tank_returned"].includes(tp.status))
        .map((tp: any) => ({
          pack_id: tp.id,
          status: tp.status,
          tank_name: tp.tanks?.tank_name ?? null,
          tank_number: tp.tanks?.tank_number ?? "",
        }));
      setActivePacks(packs);

      const billActive = ((billRes.data ?? []) as any[]).some(
        (r) => (r.units_packed ?? 0) > 0 || (r.units_blown ?? 0) > 0 || (r.units_billable ?? 0) > 0,
      );
      setHasActiveBilling(billActive);
    } catch (err) {
      toast({ title: "Error", description: "Failed to load project details", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Fetch last sync timestamp
  const fetchLastSync = useCallback(async () => {
    if (!id || !userId) return;
    const { data } = await supabase
      .from("google_calendar_events")
      .select("synced_at")
      .eq("user_id", userId)
      .eq("project_id", id)
      .order("synced_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setLastSyncedAt(data[0].synced_at);
    } else {
      setLastSyncedAt(null);
    }
  }, [id, userId]);

  const toggleSemenSource = async (b: BullRow) => {
    const next = b.semen_source === "customer" ? "company" : "customer";
    setBulls((prev) => prev.map((row) => row.id === b.id ? { ...row, semen_source: next } : row));
    const { error } = await supabase
      .from("project_bulls")
      .update({ semen_source: next })
      .eq("id", b.id);
    if (error) {
      // Roll back UI change on failure
      setBulls((prev) => prev.map((row) => row.id === b.id ? { ...row, semen_source: b.semen_source } : row));
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleChangeCustomer = async (newCustomerId: string | null) => {
    if (!newCustomerId || !project) return;
    const { error } = await supabase
      .from("projects")
      .update({ customer_id: newCustomerId })
      .eq("id", project.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    const { data } = await supabase
      .from("projects")
      .select("*, customers!projects_customer_id_fkey(name)")
      .eq("id", project.id)
      .single();
    if (data) setProject(data as unknown as ProjectRow);
    toast({ title: "Customer updated" });
  };

  const handleDelete = async () => {
    if (!id) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) {
      toast({ title: "Could not delete project", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Project deleted", description: project?.name + " has been removed." });
      navigate("/operations");
    }
  };

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  useEffect(() => {
    fetchLastSync();
  }, [fetchLastSync]);

  useEffect(() => {
    let isMounted = true;

    if (isGoogleCalendarConfigured()) {
      setGoogleCalendarConfigured(true);
      return () => {
        isMounted = false;
      };
    }

    isGoogleCalendarConfiguredAsync().then((configured) => {
      if (isMounted) {
        setGoogleCalendarConfigured(configured);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Project not found.
      </div>
    );
  }

  const breedingDisplay = project.breeding_date
    ? format(parseISO(project.breeding_date), "MMMM d, yyyy")
    : "—";

  const breedingTimeDisplay = project.breeding_time
    ? formatTime12(project.breeding_time)
    : "";

  // --- Shared helpers for Google Calendar ---

  const filteredEvents = events.filter((ev) => ev.event_name !== "Return Heat");

  const buildDescription = () => {
    let desc = `Protocol: ${project.protocol}\nCattle Type: ${project.cattle_type}\nHead Count: ${project.head_count}`;
    if (project.breeding_date) {
      desc += `\nBreeding Date: ${format(parseISO(project.breeding_date), "MMMM d, yyyy")}`;
      if (project.breeding_time) desc += ` at ${formatTime12(project.breeding_time)}`;
    }
    if (bulls.length > 0) {
      desc += "\n\nBulls:";
      for (const b of bulls) {
        const name = getBullDisplayName(b);
        desc += `\n  ${name} — ${b.units} units`;
      }
    }
    return desc;
  };

  const openEventsInBrowser = () => {
    if (filteredEvents.length > 8) {
      if (!confirm(`This will open ${filteredEvents.length} browser tabs. Continue?`)) return;
    }
    const description = buildDescription();
    filteredEvents.forEach((ev, idx) => {
      const summary = `${project.name} — ${ev.event_name}`;
      const allDay = isNoTimeEvent(ev.event_name);
      const dateClean = ev.event_date.replace(/-/g, "");
      let dates: string;
      if (allDay) {
        const d = new Date(ev.event_date + "T00:00:00");
        d.setDate(d.getDate() + 1);
        const endStr = d.toISOString().slice(0, 10).replace(/-/g, "");
        dates = `${dateClean}/${endStr}`;
      } else {
        const time = (ev.event_time ?? "08:00").replace(":", "") + "00";
        const startDt = `${dateClean}T${time}`;
        const d = new Date(`${ev.event_date}T${ev.event_time ?? "08:00"}:00`);
        d.setHours(d.getHours() + 1);
        const endHH = String(d.getHours()).padStart(2, "0");
        const endMM = String(d.getMinutes()).padStart(2, "0");
        const endDt = `${dateClean}T${endHH}${endMM}00`;
        dates = `${startDt}/${endDt}`;
      }
      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(summary)}&dates=${dates}&details=${encodeURIComponent(description)}`;
      setTimeout(() => window.open(url, "_blank"), idx * 100);
    });
  };

  // --- Push to Google Calendar ---
  const doPush = async (token: string, calId: string) => {
    setPushing(true);
    try {
      const description = buildDescription();
      const calendarEvents: CalendarEventInput[] = filteredEvents.map((ev) => {
        const hasTime = !isNoTimeEvent(ev.event_name) && !!ev.event_time;
        const timeSuffix = hasTime ? ` @ ${formatTime12(ev.event_time!)}` : "";
        return {
          protocolEventId: ev.id,
          summary: `${project.name} — ${ev.event_name}${timeSuffix}`,
          description,
          eventDate: ev.event_date,
          eventTime: null,
          isAllDay: true,
        };
      });
      const result = await pushEventsToGoogleCalendar(project.id, calendarEvents, userId, token, calId);
      if (result.errors.length > 0) {
        toast({
          title: "Sync completed with errors",
          description: result.errors.join("\n"),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Google Calendar synced",
          description: `${result.created} added, ${result.updated} updated`,
        });
      }
      await fetchLastSync();
    } finally {
      setPushing(false);
    }
  };

  const handlePushToGoogle = async () => {
    if (!userId) return;
    try {
      // Get token FIRST — directly on click so popup isn't blocked
      const token = await getGoogleAccessToken();

      if (!orgGoogleCalendarId) {
        // No calendar chosen yet — fetch list and show picker
        setPushing(true);
        const calendars = await listGoogleCalendars(token);
        setGoogleCalendars(calendars);
        setShowCalendarPicker(true);
        setPushing(false);
        return;
      }

      // Calendar is set — push events
      await doPush(token, orgGoogleCalendarId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Google Calendar", description: msg || "Sign-in cancelled", variant: "destructive" });
      setPushing(false);
    }
  };

  const handleCalendarSelected = async (calId: string) => {
    if (!orgId) return;
    // Save to org so all members use this calendar
    await supabase
      .from("organizations")
      .update({ google_calendar_id: calId })
      .eq("id", orgId);
    setOrgGoogleCalendarId(calId);
    setShowCalendarPicker(false);
    const selectedCal = googleCalendars.find((c) => c.id === calId);
    toast({ title: "Calendar saved", description: `"${selectedCal?.summary || calId}" will be used for all projects.` });
    // Now auto-push since user was trying to push when we showed the picker
    try {
      const token = await getGoogleAccessToken();
      await doPush(token, calId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Google Calendar", description: msg || "Push failed", variant: "destructive" });
    }
  };

  const handleChangeCalendar = async () => {
    try {
      const token = await getGoogleAccessToken();
      const calendars = await listGoogleCalendars(token);
      setGoogleCalendars(calendars);
      setShowCalendarPicker(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Google Calendar", description: msg || "Sign-in cancelled", variant: "destructive" });
    }
  };

  const handleRemoveFromGoogle = async () => {
    if (!userId) return;
    try {
      const token = await getGoogleAccessToken();
      setRemoving(true);
      const result = await removeEventsFromGoogleCalendar(project.id, userId, token, orgGoogleCalendarId || "primary");
      if (result.errors.length > 0) {
        toast({
          title: "Removed with errors",
          description: result.errors.join("\n"),
          variant: "destructive",
        });
      } else {
        toast({ title: "Events removed", description: `${result.removed} events removed from Google Calendar.` });
      }
      setLastSyncedAt(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Google Calendar", description: msg || "Sign-in cancelled", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        {/* Top actions */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/operations")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden h-9 w-9" title="Export">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 w-56 bg-popover border border-border shadow-lg">
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={openEventsInBrowser}
                >
                  <Calendar className="h-4 w-4" /> Open events in Google Calendar
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => {
                    const bullsForIcs = bulls.map((b) => ({
                      bull_name: getBullDisplayName(b),
                      registration_number: b.bulls_catalog ? b.bulls_catalog.registration_number : "",
                      units: b.units,
                    }));
                    const icsEvents = buildProjectIcsEvents(project, events, bullsForIcs);
                    const icsContent = generateIcsFile(icsEvents, `${project.name} — BeefSynch`);
                    const safeName = project.name.replace(/\s+/g, "_");
                    downloadIcsFile(icsContent, `${safeName}_BeefSynch.ics`);
                    toast({ title: "Calendar downloaded", description: `${project.name} .ics file saved.` });
                  }}
                >
                  <Download className="h-4 w-4" /> Download .ics
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => {
                    generateProjectCsv(project, events, bulls);
                    toast({ title: "CSV downloaded", description: `${project.name} CSV saved.` });
                  }}
                >
                  <Download className="h-4 w-4" /> Download CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" /> Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="hidden lg:inline-flex h-9 w-9" title="Export">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 w-56 bg-popover border border-border shadow-lg">
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={openEventsInBrowser}
                >
                  <Calendar className="h-4 w-4" /> Open events in Google Calendar
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => {
                    const bullsForIcs = bulls.map((b) => ({
                      bull_name: getBullDisplayName(b),
                      registration_number: b.bulls_catalog ? b.bulls_catalog.registration_number : "",
                      units: b.units,
                    }));
                    const icsEvents = buildProjectIcsEvents(project, events, bullsForIcs);
                    const icsContent = generateIcsFile(icsEvents, `${project.name} — BeefSynch`);
                    const safeName = project.name.replace(/\s+/g, "_");
                    downloadIcsFile(icsContent, `${safeName}_BeefSynch.ics`);
                    toast({ title: "Calendar downloaded", description: `${project.name} .ics file saved.` });
                  }}
                >
                  <Download className="h-4 w-4" /> Download .ics
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => {
                    generateProjectCsv(project, events, bulls);
                    toast({ title: "CSV downloaded", description: `${project.name} CSV saved.` });
                  }}
                >
                  <Download className="h-4 w-4" /> Download CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" /> Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              title="Share PDF"
              onClick={() => {
                generateProjectPdf(project, events, bulls);
                toast({ title: "PDF downloaded", description: `${project.name} report saved.` });
              }}
            >
              <FileDown className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="hidden lg:inline-flex h-9 w-9"
              title="Share PDF"
              onClick={() => {
                generateProjectPdf(project, events, bulls);
                toast({ title: "PDF downloaded", description: `${project.name} report saved.` });
              }}
            >
              <FileDown className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              title="Pack Tank"
              onClick={() => {
                if (activePacks.length > 0) {
                  const labels = activePacks
                    .map((p) => (p.tank_name ? `${p.tank_name} #${p.tank_number}` : `#${p.tank_number}`))
                    .join(", ");
                  if (!window.confirm(`This project already has a tank packed (${labels}). Pack another?`)) {
                    return;
                  }
                }
                navigate(`/pack-tank?projectId=${project.id}`);
              }}
            >
              <Package className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              title="Breeding Worksheet"
              onClick={async () => {
                if (!project) return;
                await printBreedingWorksheet(project);
                toast({ title: "Breeding worksheet downloaded" });
              }}
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" title="Billing Sheet" onClick={() => navigate(`/project/${project.id}/billing`)}>
              <ClipboardList className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" title="Edit" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold font-display text-foreground">
            {project.name}
          </h1>
          {/* Customer line with edit pencil */}
          <div className="flex items-center gap-2 text-lg text-muted-foreground">
            <span>
              {(Array.isArray(project.customers)
                ? project.customers[0]?.name
                : project.customers?.name) || "—"}
            </span>
            <Popover open={customerEditOpen} onOpenChange={setCustomerEditOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Change customer">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="start">
                <div className="text-sm font-medium mb-2">Change Customer</div>
                <CustomerPicker
                  value={project.customer_id || null}
                  onChange={(newId) => {
                    handleChangeCustomer(newId);
                    setCustomerEditOpen(false);
                  }}
                  orgId={orgId || ""}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-primary/20 text-primary border-primary/30">
              {project.protocol}
            </Badge>
            <Badge
              className={
                project.cattle_type === "Cows"
                  ? "bg-accent/20 text-accent border-accent/30"
                  : "bg-info/20 text-info border-info/30"
              }
            >
              {project.cattle_type}
            </Badge>
            <Badge
              className={
                statusColor[project.status] ??
                "bg-muted text-muted-foreground"
              }
            >
              {project.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {project.head_count} head
            </span>
            <span className="text-sm text-muted-foreground">
              · {breedingDisplay}
              {breedingTimeDisplay && ` at ${breedingTimeDisplay}`}
            </span>
          </div>
          {(activePacks.length > 0 || hasActiveBilling) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {activePacks.map((p) => (
                <button
                  key={p.pack_id}
                  type="button"
                  onClick={() => navigate(`/pack/${p.pack_id}`)}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                >
                  <Package className="h-3.5 w-3.5" />
                  Packed in: {p.tank_name ? `${p.tank_name} (#${p.tank_number})` : `#${p.tank_number}`}
                  <Badge variant="outline" className="ml-1 capitalize text-[10px] h-4">
                    {p.status.replace(/_/g, " ")}
                  </Badge>
                </button>
              ))}
              {hasActiveBilling && (
                <button
                  type="button"
                  onClick={() => navigate(`/project/${project.id}/billing`)}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/25 transition-colors"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Billing active
                </button>
              )}
            </div>
          )}
        </div>

        {/* Contact History */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
              Contact History
            </CardTitle>
            {!contactEditing && (
              <Button size="sm" onClick={handleQuickLog} disabled={contactSaving} className="gap-1">
                <Plus className="h-4 w-4" /> Log Contact
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {contactEditing && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Date</label>
                    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !contactDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="h-4 w-4 mr-2 opacity-50" />
                          {contactDate ? format(contactDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={contactDate}
                          onSelect={(d) => { setContactDate(d); setDatePickerOpen(false); }}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Contacted By</label>
                    <Select value={contactBy} onValueChange={setContactBy}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select team member" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgMembers.map((m) => (
                          <SelectItem key={m.user_id!} value={m.user_id!}>
                            {m.email ?? "Unknown"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Notes</label>
                  <Textarea
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    placeholder="What was discussed? Key decisions, follow-ups, etc."
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleContactSave} disabled={contactSaving || !contactDate || !contactBy}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setContactEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {contacts.length === 0 && !contactEditing ? (
              <p className="text-sm text-muted-foreground">No contacts logged yet.</p>
            ) : contacts.length > 0 && (
              <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
                {contacts.map((c) => (
                  <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {format(parseISO(c.contact_date), "MMM d, yyyy")}
                          <span className="text-muted-foreground font-normal"> · {resolveContactEmail(c.contacted_by)}</span>
                        </p>
                        {c.notes && (
                          <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{c.notes}</p>
                        )}
                      </div>
                      {(orgRole === "owner" || orgRole === "admin") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => handleDeleteContact(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Synchronization Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Synchronization Schedule {project.protocol && <span className="font-normal text-muted-foreground">— {project.protocol}</span>}</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No protocol events found.
              </p>
            ) : (
              <>
                {/* Mobile condensed view */}
                <div className="lg:hidden divide-y divide-border">
                  {events.map((ev) => {
                    const isNoTime = isNoTimeEvent(ev.event_name);
                    const time = isNoTime || !ev.event_time ? "" : ` · ${formatTime12(ev.event_time)}`;
                    return (
                      <div key={ev.id} className="flex items-center justify-between py-2 gap-2">
                        <span className="font-medium text-sm text-foreground">{ev.event_name}</span>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(parseISO(ev.event_date), "MMM d, yyyy")}{time}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Desktop table */}
                <Table className="hidden lg:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((ev) => {
                      const isNoTime = isNoTimeEvent(ev.event_name);
                      return (
                        <TableRow key={ev.id}>
                          <TableCell className="font-medium">
                            {ev.event_name}
                          </TableCell>
                          <TableCell>
                            {format(parseISO(ev.event_date), "EEEE, MMMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            {isNoTime || !ev.event_time
                              ? "—"
                              : formatTime12(ev.event_time)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        {/* Google Calendar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              Google Calendar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {googleCalendarConfigured && (
              <div className="space-y-3">
                {/* Calendar picker — shown when no org calendar is set or user clicks Change */}
                {showCalendarPicker && googleCalendars.length > 0 && (
                  <div className="rounded-lg border border-border bg-secondary/50 p-4 space-y-3">
                    <p className="text-sm font-medium text-foreground">Choose a Google Calendar</p>
                    <p className="text-xs text-muted-foreground">All projects in your organization will push events to this calendar.</p>
                    <Select onValueChange={handleCalendarSelected}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a calendar…" />
                      </SelectTrigger>
                      <SelectContent>
                        {googleCalendars.map((cal) => (
                          <SelectItem key={cal.id} value={cal.id}>
                            {cal.summary}{cal.primary ? " (Primary)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => setShowCalendarPicker(false)}>
                      Cancel
                    </Button>
                  </div>
                )}

                {/* Push / Remove buttons — shown when picker is NOT open */}
                {!showCalendarPicker && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={handlePushToGoogle} disabled={pushing || filteredEvents.length === 0}>
                        {pushing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Pushing…
                          </>
                        ) : (
                          <>
                            <Calendar className="h-4 w-4 mr-1" /> Push to Google Calendar
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground text-xs"
                        onClick={handleRemoveFromGoogle}
                        disabled={removing}
                      >
                        {removing ? "Removing…" : "Remove from Calendar"}
                      </Button>
                    </div>
                    {orgGoogleCalendarId && (
                      <button
                        onClick={handleChangeCalendar}
                        className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                      >
                        Change calendar
                      </button>
                    )}
                    {lastSyncedAt && (
                      <p className="text-xs text-muted-foreground">
                        Last synced: {format(parseISO(lastSyncedAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* URL fallback — always visible */}
            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={openEventsInBrowser}
                disabled={filteredEvents.length === 0}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open events in browser
              </Button>
              <p className="text-xs text-muted-foreground mt-1">Opens a new tab for each event</p>
            </div>
          </CardContent>
        </Card>

        {/* Bulls & Semen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bulls & Semen</CardTitle>
          </CardHeader>
          <CardContent>
            {bulls.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bulls assigned.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Bull Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulls.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="w-8">
                        {b.bull_catalog_id && (
                          <button onClick={(e) => toggleFavorite(b.bull_catalog_id!, e)}>
                            <Star className={`h-4 w-4 transition-colors ${favoritedIds.has(b.bull_catalog_id!) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"}`} />
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {b.bulls_catalog
                          ? (() => {
                              const isSelectSires = (b.bulls_catalog?.company || "").toLowerCase().includes("select sires");
                              const bullDisplay = `${b.bulls_catalog!.bull_name} (${b.bulls_catalog?.company || "Custom"})`;
                              if (isSelectSires) {
                                const breedSlug = (b.bulls_catalog?.breed || "").toLowerCase().replace(/\s+/g, "-");
                                const nameSlug = b.bulls_catalog!.bull_name.toLowerCase().replace(/\s+/g, "-");
                                const url = `https://selectsiresbeef.com/bull/${breedSlug}/${nameSlug}/`;
                                return (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {bullDisplay}
                                    <ExternalLink className="inline h-3 w-3 ml-1 -mt-0.5" />
                                  </a>
                                );
                              }
                              return bullDisplay;
                            })()
                          : b.custom_bull_name ?? "Unknown"}
                        {b.bull_catalog_id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditBullId(b.bull_catalog_id); }}
                            className="ml-1.5 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit bull info"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {b.bulls_catalog?.registration_number && (
                          <div className="mt-0.5">
                            <ClickableRegNumber registrationNumber={b.bulls_catalog.registration_number} breed={b.bulls_catalog.breed} />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleSemenSource(b)}
                          className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border transition-colors ${
                            b.semen_source === "customer"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
                              : "border-blue-500/40 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20"
                          }`}
                          title="Click to toggle who provides the semen"
                        >
                          {b.semen_source === "customer" ? "Customer supplied" : "CATL provides"}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">{b.units}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {project.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {project.notes}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <NewProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onProjectCreated={() => load()}
        editData={project ? {
          id: project.id,
          name: project.name,
          customer_id: (project as any).customer_id,
          cattle_type: project.cattle_type,
          protocol: project.protocol,
          head_count: project.head_count,
          breeding_date: project.breeding_date,
          breeding_time: project.breeding_time,
          status: project.status,
          notes: project.notes,
          last_contacted_date: project.last_contacted_date,
          last_contacted_by: project.last_contacted_by,
          bulls: bulls.map((b) => ({
            name: b.bulls_catalog ? b.bulls_catalog.bull_name : b.custom_bull_name ?? "",
            catalogId: b.bull_catalog_id,
            units: b.units,
            semenSource: b.semen_source,
          })),
        } : null}
      />

      {editBullId && (
        <QuickBullEditDialog
          open={!!editBullId}
          onOpenChange={(open) => { if (!open) setEditBullId(null); }}
          bullCatalogId={editBullId}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{project?.name}" and all its protocol events and bull assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectDetail;
