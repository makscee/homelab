import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// UI-SPEC §Color — severity palette. Classes are grep-verifiable literals.
const SEV_CLASS: Record<string, string> = {
  critical: "bg-red-900/30 border-red-500/50 text-red-400",
  warning: "bg-amber-900/30 border-amber-500/50 text-amber-400",
  info: "bg-slate-700/50 border-slate-500/50 text-slate-300",
  other: "bg-muted text-muted-foreground",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const cls = SEV_CLASS[severity] ?? SEV_CLASS.other;
  return (
    <Badge variant="outline" className={cn(cls, "uppercase tracking-wide")}>
      {severity}
    </Badge>
  );
}
