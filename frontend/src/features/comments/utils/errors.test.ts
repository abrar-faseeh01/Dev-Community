import { ApiError } from "@/lib/axios/api-error";
import { describeSaveError, hasStatus, splitCommentFormErrors } from "./errors";

describe("splitCommentFormErrors", () => {
  // Response shapes below are copied verbatim from a live POST
  // posts/:postId/comments run against the real backend (2026-09-23), not
  // guessed — see the CP4 report.

  it("puts a single 'body ...' message on the body field", () => {
    const error = new ApiError("Validation failed", ["body should not be empty"], 400);
    expect(splitCommentFormErrors(error, "fallback")).toEqual({
      fields: { body: "body should not be empty" },
      banner: null,
    });
  });

  it("keeps only the first 'body ...' message on the field; later ones (even body-prefixed) fall to the banner", () => {
    // Same "first match wins" rule as splitPostFormErrors: only the first
    // message that starts with "body" claims the field slot — a second one
    // doesn't overwrite it, but isn't dropped either, it lands in the
    // banner alongside anything else.
    const error = new ApiError(
      "Validation failed",
      [
        "body must be shorter than or equal to 2000 characters",
        "body should not be empty",
        "body must be a string",
      ],
      400,
    );
    expect(splitCommentFormErrors(error, "fallback")).toEqual({
      fields: { body: "body must be shorter than or equal to 2000 characters" },
      banner: "body should not be empty body must be a string",
    });
  });

  it("puts a non-body message (unknown property) in the banner, not on a field", () => {
    const error = new ApiError(
      "Validation failed",
      ["property notAField should not exist"],
      400,
    );
    expect(splitCommentFormErrors(error, "fallback")).toEqual({
      fields: {},
      banner: "property notAField should not exist",
    });
  });

  it("puts a parentCommentId message in the banner — there is no field for it", () => {
    const error = new ApiError(
      "Validation failed",
      ["parentCommentId must be a mongodb id"],
      400,
    );
    expect(splitCommentFormErrors(error, "fallback")).toEqual({
      fields: {},
      banner: "parentCommentId must be a mongodb id",
    });
  });

  it("remaps a known technical message when errors is empty (e.g. 'Parent comment not found')", () => {
    const error = new ApiError("Parent comment not found", [], 404);
    expect(splitCommentFormErrors(error, "fallback")).toEqual({
      fields: {},
      banner: "The comment you're replying to has been deleted.",
    });
  });

  it("uses the network-failure message when the ApiError has no status", () => {
    const error = new ApiError("Request failed", []);
    expect(splitCommentFormErrors(error, "fallback").banner).toBe(
      "Couldn't reach the server, so nothing was saved. Check your connection and try again.",
    );
  });
});

describe("hasStatus", () => {
  it("matches an ApiError with the given status", () => {
    expect(hasStatus(new ApiError("x", [], 404), 404)).toBe(true);
  });

  it("does not match a different status or a non-ApiError", () => {
    expect(hasStatus(new ApiError("x", [], 400), 404)).toBe(false);
    expect(hasStatus(new Error("x"), 404)).toBe(false);
  });
});

describe("describeSaveError", () => {
  it("returns the ApiError's own message when it isn't one of the known technical ones", () => {
    expect(
      describeSaveError(new ApiError("Something else went wrong", [], 500), "fallback"),
    ).toBe("Something else went wrong");
  });

  it.each([
    ["Post not found", "This post is no longer available."],
    ["Comment not found", "This comment has been deleted."],
    ["Parent comment not found", "The comment you're replying to has been deleted."],
    [
      "The parent comment belongs to a different post",
      "Something went wrong loading this comment. Refresh the page and try again.",
    ],
  ])("remaps the technical message %j to a reader-facing one", (raw, friendly) => {
    expect(describeSaveError(new ApiError(raw, [], 404), "fallback")).toBe(friendly);
  });

  it("returns the network message when the ApiError has no status", () => {
    expect(describeSaveError(new ApiError("Request failed", []), "fallback")).toBe(
      "Couldn't reach the server, so nothing was saved. Check your connection and try again.",
    );
  });

  it("falls back for a non-Error value", () => {
    expect(describeSaveError("not an error", "fallback")).toBe("fallback");
  });
});
