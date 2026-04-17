import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton per UI-SPEC §Loading state: 5 rows at 56px height so the
 * layout does not jump when the RSC resolves and real rows paint.
 */
export default function Loading() {
  return (
    <div className="p-8">
      <Skeleton className="mb-2 h-7 w-48" />
      <Skeleton className="mb-6 h-4 w-96" />
      <div className="space-y-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
