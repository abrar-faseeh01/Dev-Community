import { ApiError } from "@/lib/axios/api-error";
import { describeReactionError } from "./errors";

describe("describeReactionError", () => {
  it("reports a network failure when there's no response", () => {
    const error = new ApiError("Request failed", [], undefined);
    expect(describeReactionError(error)).toBe(
      "Couldn't reach the server, so your reaction wasn't saved.",
    );
  });

  it("reports the target as gone on a 404", () => {
    const error = new ApiError("Not found", [], 404);
    expect(describeReactionError(error)).toBe(
      "This post or comment is no longer available.",
    );
  });

  it("falls back to a generic message for anything else", () => {
    const error = new ApiError("Forbidden", [], 403);
    expect(describeReactionError(error)).toBe(
      "Couldn't save your reaction. Please try again.",
    );
  });
});
