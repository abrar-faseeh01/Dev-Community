import { searchHref } from "@/features/posts/utils/search-href";

describe("searchHref", () => {
  it("adds q to a bare pathname", () => {
    expect(searchHref("/posts", new URLSearchParams(""), "react")).toBe(
      "/posts?q=react",
    );
  });

  it("uses the bare pathname when the term is empty", () => {
    expect(searchHref("/posts", new URLSearchParams("q=react"), "")).toBe(
      "/posts",
    );
  });

  it("replaces an existing q", () => {
    expect(searchHref("/posts", new URLSearchParams("q=react"), "vue")).toBe(
      "/posts?q=vue",
    );
  });

  it("keeps the other params when setting q", () => {
    expect(
      searchHref("/posts", new URLSearchParams("sort=top&notice=x"), "react"),
    ).toBe("/posts?sort=top&notice=x&q=react");
  });

  it("keeps the other params when clearing q", () => {
    expect(
      searchHref("/posts", new URLSearchParams("sort=top&q=react"), ""),
    ).toBe("/posts?sort=top");
  });

  it("encodes characters that are special in a URL", () => {
    const href = searchHref("/posts", new URLSearchParams(""), 'c++ & "x" %');
    expect(href).not.toContain(" ");
    expect(href).not.toContain('&"');
    expect(new URL(href, "http://x").searchParams.get("q")).toBe('c++ & "x" %');
  });

  it("does not change the params object it is given", () => {
    const params = new URLSearchParams("sort=top");
    searchHref("/posts", params, "react");
    expect(params.toString()).toBe("sort=top");
  });
});
