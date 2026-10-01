import { ApiError } from "@/lib/axios/api-error";

export type SummarizeFailure = {
  message: string;
  // false when asking again can't change the outcome (the post is too short or
  // gone), so the screen shouldn't offer "Try again".
  retryable: boolean;
};

const GENERIC: SummarizeFailure = {
  message: "Couldn't summarize this post. Try again.",
  retryable: true,
};

// Turns a failed summarize call into what the reader sees. The wording is
// fixed here, keyed on the status, instead of echoing the server's message: the
// statuses are the contract (see POST /posts/:id/summarize in the backend), and
// the server's text is for logs and API clients.
//
// 503 covers an unreachable summarizer, a per-minute limit and the day's quota
// being used up, so it promises nothing about trying again right away. 429 is
// this app's own limit (10 a minute), which a short wait does clear.
export function describeSummarizeError(error: unknown): SummarizeFailure {
  if (!(error instanceof ApiError)) return GENERIC;

  switch (error.status) {
    // No response at all: offline, server down, or the request timed out. The
    // two can't be told apart, so the message covers both.
    case undefined:
      return {
        message:
          "Couldn't reach the server, or it took too long to respond. Check your connection and try again.",
        retryable: true,
      };
    case 401:
      return {
        message: "Sign in to summarize this post.",
        retryable: false,
      };
    case 400:
    case 404:
      return {
        message: "This post is no longer available.",
        retryable: false,
      };
    case 422:
      return {
        message: "This post is too short to summarize.",
        retryable: false,
      };
    case 429:
      return {
        message:
          "You're summarizing too quickly. Wait a minute, then try again.",
        retryable: true,
      };
    case 502:
      return {
        message: "The summarizer returned an unusable response. Try again.",
        retryable: true,
      };
    case 503:
      return {
        message:
          "Summaries are temporarily unavailable. Please try again later.",
        retryable: true,
      };
    case 504:
      return {
        message: "The summarizer took too long to respond. Try again.",
        retryable: true,
      };
    default:
      return GENERIC;
  }
}
