import {
  DEFAULT_POST_SORT,
  FEED_SORT_LABELS,
  FEED_SORT_ORDER,
  POST_SORTS,
  feedSortHref,
  isPostSort,
  parsePostSort,
} from "@/features/posts/utils/feed-sort";

describe("feed sort options", () => {
  it("matches the values the backend accepts, in the backend's order", () => {
    expect([...POST_SORTS]).toEqual(["latest", "top", "discussed"]);
  });

  it("defaults to latest", () => {
    expect(DEFAULT_POST_SORT).toBe("latest");
  });

  it("has a non-empty label for every sort", () => {
    for (const sort of POST_SORTS) {
      expect(FEED_SORT_LABELS[sort]).toBeTruthy();
    }
    expect(Object.keys(FEED_SORT_LABELS).sort()).toEqual(
      [...POST_SORTS].sort(),
    );
  });

  it("shows the tabs as Top, Latest, Most Discussed, each sort exactly once", () => {
    expect(FEED_SORT_ORDER.map((sort) => FEED_SORT_LABELS[sort])).toEqual([
      "Top",
      "Latest",
      "Most Discussed",
    ]);
    expect([...FEED_SORT_ORDER].sort()).toEqual([...POST_SORTS].sort());
  });
});

describe("isPostSort", () => {
  it.each(["latest", "top", "discussed"])("accepts %s", (value) => {
    expect(isPostSort(value)).toBe(true);
  });

  it.each([
    null,
    undefined,
    "",
    " top",
    "top ",
    "Top",
    "LATEST",
    "trending",
    "constructor",
    "__proto__",
    "toString",
    "top,latest",
  ])("rejects %p", (value) => {
    expect(isPostSort(value)).toBe(false);
  });
});

describe("parsePostSort", () => {
  it.each(["latest", "top", "discussed"] as const)(
    "returns %s unchanged",
    (value) => {
      expect(parsePostSort(value)).toBe(value);
    },
  );

  it.each([null, undefined, "", "Top", "trending", "constructor", "__proto__"])(
    "falls back to latest for %p",
    (value) => {
      expect(parsePostSort(value)).toBe("latest");
    },
  );
});

describe("feedSortHref", () => {
  it("adds sort for top and discussed", () => {
    expect(feedSortHref("/posts", new URLSearchParams(""), "top")).toBe(
      "/posts?sort=top",
    );
    expect(feedSortHref("/posts", new URLSearchParams(""), "discussed")).toBe(
      "/posts?sort=discussed",
    );
  });

  it("uses the bare pathname for the default sort", () => {
    expect(
      feedSortHref("/posts", new URLSearchParams("sort=top"), "latest"),
    ).toBe("/posts");
  });

  it("replaces an existing sort and keeps the other params", () => {
    expect(
      feedSortHref(
        "/posts",
        new URLSearchParams("sort=top&notice=x"),
        "discussed",
      ),
    ).toBe("/posts?sort=discussed&notice=x");
    expect(feedSortHref("/posts", new URLSearchParams("notice=x"), "top")).toBe(
      "/posts?notice=x&sort=top",
    );
  });

  it("drops an invalid sort when moving to the default", () => {
    expect(
      feedSortHref("/posts", new URLSearchParams("sort=bogus"), "latest"),
    ).toBe("/posts");
  });

  it("does not change the params it was given", () => {
    const params = new URLSearchParams("sort=top");
    feedSortHref("/posts", params, "latest");
    expect(params.toString()).toBe("sort=top");
  });
});
