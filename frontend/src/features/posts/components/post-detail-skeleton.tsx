// Same outer shape as PostDetail (a title, a byline, and a block of body
// lines), so the page doesn't jump when the real post replaces it. Purely
// decorative: aria-hidden, because the page's own status region announces
// "Loading post…".
export function PostDetailSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-xl border border-neutral-800 bg-neutral-900 p-5 sm:p-8"
    >
      <div className="h-7 w-3/4 rounded bg-neutral-800" />
      <div className="mt-4 h-3.5 w-2/5 rounded bg-neutral-800" />
      <div className="mt-8 flex flex-col gap-3">
        <div className="h-3.5 w-full rounded bg-neutral-800" />
        <div className="h-3.5 w-full rounded bg-neutral-800" />
        <div className="h-3.5 w-full rounded bg-neutral-800" />
        <div className="h-3.5 w-5/6 rounded bg-neutral-800" />
        <div className="h-3.5 w-2/3 rounded bg-neutral-800" />
      </div>
    </div>
  );
}
