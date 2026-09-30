import { SEARCH_MAX_QUERY_LENGTH } from "@/features/posts/utils/search-limits";
import { normalizeSearchTerm } from "@/features/posts/utils/search-term";

describe("normalizeSearchTerm", () => {
  it("trims and lowercases", () => {
    expect(normalizeSearchTerm("  React  ")).toBe("react");
  });

  it("collapses runs of whitespace, including tabs and newlines", () => {
    expect(normalizeSearchTerm("react \t\n  hooks")).toBe("react hooks");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeSearchTerm("")).toBe("");
    expect(normalizeSearchTerm("   \n\t ")).toBe("");
  });

  it("leaves special characters alone", () => {
    expect(normalizeSearchTerm('C++ "Hooks" -class %')).toBe(
      'c++ "hooks" -class %',
    );
  });

  it("cuts a too-long term to the API's maximum", () => {
    const term = normalizeSearchTerm("a".repeat(SEARCH_MAX_QUERY_LENGTH + 50));
    expect(term).toHaveLength(SEARCH_MAX_QUERY_LENGTH);
  });

  it("does not leave a trailing space where the cut lands", () => {
    const raw = "a".repeat(SEARCH_MAX_QUERY_LENGTH - 1) + " b";
    const term = normalizeSearchTerm(raw);
    expect(term).toBe("a".repeat(SEARCH_MAX_QUERY_LENGTH - 1));
  });

  it("is idempotent", () => {
    const once = normalizeSearchTerm("  Mixed   CASE  ");
    expect(normalizeSearchTerm(once)).toBe(once);
  });
});
