export default function Loading() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <p role="status" aria-live="polite" className="text-sm text-muted">
        Loading…
      </p>
    </main>
  );
}
