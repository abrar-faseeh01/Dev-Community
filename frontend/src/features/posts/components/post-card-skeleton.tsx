// Same outer shape as PostCard (border, padding, title / byline / three body
// lines), so the list doesn't jump when real cards replace it. Purely
// decorative: aria-hidden, because the wrapper that renders these owns the
// "Loading posts…" status announcement.
export function PostCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="h-5 w-2/3 rounded bg-border/70" />
      <div className="mt-3 h-3.5 w-2/5 rounded bg-border/70" />
      <div className="mt-4 flex flex-col gap-2">
        <div className="h-3.5 w-full rounded bg-border/70" />
        <div className="h-3.5 w-full rounded bg-border/70" />
        <div className="h-3.5 w-4/5 rounded bg-border/70" />
      </div>
    </div>
  );
}
