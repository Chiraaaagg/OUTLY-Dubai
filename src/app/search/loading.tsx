import { Skeleton, SkeletonGrid } from "@/components/ui/primitives";

/**
 * Route-level loading UI. Next streams this while the server renders results,
 * so the layout never jumps: the skeleton grid matches the real grid's columns
 * and card proportions exactly (CLS < 0.1 per PRD §15).
 */
export default function Loading() {
  return (
    <div className="container-page py-6">
      <Skeleton className="mb-3 h-3 w-40" />
      <Skeleton className="mb-2 h-8 w-72" />
      <Skeleton className="mb-8 h-4 w-96" />
      <div className="grid grid-safe gap-8 lg:grid-cols-[17rem_1fr]">
        <div className="hidden lg:block">
          <Skeleton className="h-[32rem] w-full rounded-[var(--radius-tile)]" />
        </div>
        <SkeletonGrid count={9} />
      </div>
    </div>
  );
}
