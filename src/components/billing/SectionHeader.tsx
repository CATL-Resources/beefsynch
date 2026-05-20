import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SectionHeaderProps {
  title: string;
  isEditing: boolean;
  onToggleEdit: () => void;
  locked: boolean;
  right?: React.ReactNode;
}

export default function SectionHeader({ title, isEditing, onToggleEdit, locked, right }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-base font-bold tracking-tight uppercase text-muted-foreground">{title}</h2>
      <div className="flex items-center gap-2">
        {right}
        {!locked && (
          isEditing ? (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onToggleEdit}>
              Done
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onToggleEdit}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
          )
        )}
      </div>
    </div>
  );
}
