import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Placeholder rendered by the Next.js loading.tsx convention while the RSC
 * overview page is resolving its initial Prometheus snapshot. Matches
 * HostCard's outer dimensions to avoid layout shift when the real tiles
 * mount (UI-SPEC §Spacing).
 */
export default function OverviewLoading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-full" />
              <div className="grid grid-cols-3 gap-2 pt-1">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
