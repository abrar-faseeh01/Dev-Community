import { ROUTES } from "@/constants/routes";
import type { SummarizeAction } from "@/features/posts/hooks/use-summarize-action";
import { splitSummaryIntoBullets } from "@/features/posts/utils/summary-bullets";
import Link from "next/link";

// The "AI Summarizer" side panel. Only rendered once the reader has asked
// for a summary (see SummarizeLayout); messages are announced by the layout's
// live region, so nothing in here is one.
//
// Everything the summarizer returns is untrusted text from a model (steered,
// if a post's body tried to). It is only ever rendered as React text nodes:
// no dangerouslySetInnerHTML and no markdown, so markup in it shows as
// literal characters.
export function SummarizePanel({ action }: { action: SummarizeAction }) {
  const { result, failure, isPending, showSignInHint } = action;

  return (
    <aside
      aria-label="AI summarizer"
      className="rounded-xl border border-neutral-800 bg-neutral-900 lg:sticky lg:top-6"
    >
      {/* The title and the label never wrap: the card is as wide as this row
          needs (see SummarizeLayout), so a long header makes the card wider
          instead of breaking onto a second line. */}
      <div className="flex items-center gap-3 border-b border-neutral-800 px-5 py-4">
        <span aria-hidden="true" className="shrink-0 text-emerald-300">
          ⚡
        </span>
        <h2 className="whitespace-nowrap text-base font-semibold text-white">
          AI Summarizer
        </h2>
        {result?.source === "mock" && (
          <span className="ml-auto shrink-0 whitespace-nowrap rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400">
            Mock summary
          </span>
        )}
      </div>

      <div className="p-5">
        {showSignInHint ? (
          <p className="text-sm text-neutral-400">
            <Link
              href={ROUTES.LOGIN}
              className="font-medium text-emerald-400 hover:underline"
            >
              Sign in
            </Link>{" "}
            to summarize this post.
          </p>
        ) : isPending ? (
          <p className="text-sm text-neutral-400">Summarizing…</p>
        ) : failure ? (
          <p className="text-sm text-red-300">{failure.message}</p>
        ) : result ? (
          <>
            <ul
              aria-label="Summary points"
              className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-neutral-200 marker:text-neutral-500"
            >
              {splitSummaryIntoBullets(result.summary).map((point, index) => (
                <li key={`${index}-${point}`} className="wrap-anywhere">
                  {point}
                </li>
              ))}
            </ul>
            {result.truncated && (
              <p className="mt-4 text-xs text-neutral-400">
                Summary is based on the first part of this post
              </p>
            )}
            <ul aria-label="Tags" className="mt-5 flex flex-wrap gap-2">
              {result.tags.map((tag, index) => (
                <li
                  key={`${index}-${tag}`}
                  className="rounded-full border border-emerald-400/40 bg-emerald-400/5 px-3 py-1 text-xs font-medium text-emerald-300 wrap-anywhere"
                >
                  #{tag}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </aside>
  );
}
