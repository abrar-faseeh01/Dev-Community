import type { SummarizeAction } from "@/features/posts/hooks/use-summarize-action";

// The Summarize button in the post's author row. aria-disabled rather than
// `disabled`, so keyboard focus stays on it while it is busy.
export function SummarizeButton({ action }: { action: SummarizeAction }) {
  return (
    <button
      type="button"
      onClick={action.onClick}
      aria-disabled={action.locked ? "true" : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-300 px-3.5 py-1.5 text-sm font-semibold text-neutral-950 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
        action.locked ? "cursor-not-allowed opacity-60" : "hover:bg-emerald-200"
      }`}
    >
      {/* The same bolt as the panel's header. An emoji, so it keeps its own
          colours whatever the text colour is; decorative, because the label
          already says what the button does. */}
      <span aria-hidden="true">⚡</span>
      {action.label}
    </button>
  );
}
