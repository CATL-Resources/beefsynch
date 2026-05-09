import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BreedSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** When true, hides the "any breed" first option (use for required selects). */
  required?: boolean;
}

const NONE_VALUE = "__none__";

/**
 * Standardized breed picker backed by the `breeds` lookup table. Returns the
 * breed name (text) as the selected value — `bulls_catalog.breed` stores the
 * name directly, no FK. Empty selection is "" (blank). Active breeds only,
 * ordered by sort_order.
 */
export default function BreedSelect({
  value,
  onChange,
  placeholder = "Select breed",
  className,
  disabled,
  required,
}: BreedSelectProps) {
  const { data: breeds = [] } = useQuery({
    queryKey: ["breeds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breeds")
        .select("name, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as { name: string; sort_order: number }[];
    },
    staleTime: 60 * 60 * 1000, // breeds rarely change
  });

  // Surface the current value even if it's not in the active list (e.g. a
  // legacy "Unknown" or an inactive breed) so editing doesn't silently drop it.
  const valueIsKnown = !value || breeds.some((b) => b.name === value);

  return (
    <Select
      value={value || NONE_VALUE}
      onValueChange={(v) => onChange(v === NONE_VALUE ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {!required && (
          <SelectItem value={NONE_VALUE}>{placeholder}</SelectItem>
        )}
        {!valueIsKnown && value && (
          <SelectItem value={value}>{value} (legacy)</SelectItem>
        )}
        {breeds.map((b) => (
          <SelectItem key={b.name} value={b.name}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
