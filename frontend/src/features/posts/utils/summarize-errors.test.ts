import { ApiError } from "@/lib/axios/api-error";
import { describeSummarizeError } from "./summarize-errors";

const fail = (status?: number, message = "server text") =>
  new ApiError(message, [], status);

describe("describeSummarizeError", () => {
  it.each([
    [422, "This post is too short to summarize."],
    [404, "This post is no longer available."],
    [400, "This post is no longer available."],
    [401, "Sign in to summarize this post."],
  ])("treats %s as final: no retry", (status, message) => {
    expect(describeSummarizeError(fail(status))).toEqual({
      message,
      retryable: false,
    });
  });

  it.each([
    [429, /too quickly/],
    [502, /unusable response/],
    [503, /temporarily unavailable/],
    [504, /took too long/],
    [500, /Couldn't summarize/],
  ])("lets the reader retry after %s", (status, wording) => {
    const failure = describeSummarizeError(fail(status));
    expect(failure.retryable).toBe(true);
    expect(failure.message).toMatch(wording);
  });

  it("handles no response at all (offline, server down or timed out)", () => {
    const failure = describeSummarizeError(fail(undefined, "Request failed"));
    expect(failure.retryable).toBe(true);
    expect(failure.message).toMatch(/Couldn't reach the server/);
  });

  it("does not promise an immediate retry for 503 (the daily quota may be used up)", () => {
    expect(describeSummarizeError(fail(503)).message).toMatch(/later/);
  });

  it("never echoes the server's own message", () => {
    for (const status of [400, 404, 422, 429, 500, 502, 503, 504]) {
      expect(describeSummarizeError(fail(status, "internal detail")).message)
        .not.toContain("internal detail");
    }
  });

  it("falls back to a generic, retryable message for a non-ApiError", () => {
    expect(describeSummarizeError(new Error("boom"))).toEqual({
      message: "Couldn't summarize this post. Try again.",
      retryable: true,
    });
    expect(describeSummarizeError("nope").retryable).toBe(true);
  });
});
