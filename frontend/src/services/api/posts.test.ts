import { SEARCH_MAX_LIMIT } from "@/features/posts/utils/search-limits";
import { apiClient } from "@/lib/axios/client";
import {
  POSTS_PAGE_SIZE,
  SUMMARIZE_TIMEOUT_MS,
  getPostPage,
  searchPosts,
  summarizePost,
} from "@/services/api/posts";

jest.mock("@/lib/axios/client");
const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

function requestedParams() {
  const url = mockGet.mock.calls[0][0] as string;
  expect(url.startsWith("/posts?")).toBe(true);
  return new URLSearchParams(url.slice("/posts?".length));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({
    data: { data: { items: [], nextCursor: null } },
  });
});

describe("getPostPage", () => {
  it("sends only the page size when given nothing", async () => {
    await getPostPage();
    const params = requestedParams();
    expect(params.get("limit")).toBe(String(POSTS_PAGE_SIZE));
    expect(params.has("cursor")).toBe(false);
    expect(params.has("authorId")).toBe(false);
    expect(params.has("sort")).toBe(false);
  });

  it.each(["latest", "top", "discussed"] as const)(
    "sends sort=%s when given",
    async (sort) => {
      await getPostPage({ sort });
      expect(requestedParams().get("sort")).toBe(sort);
    },
  );

  it("sends the cursor, author and sort together, encoding the cursor", async () => {
    await getPostPage({ cursor: "ab+/=", authorId: "u1", sort: "top" });
    const params = requestedParams();
    expect(params.get("cursor")).toBe("ab+/=");
    expect(params.get("authorId")).toBe("u1");
    expect(params.get("sort")).toBe("top");
    expect(mockGet.mock.calls[0][0]).not.toContain("ab+/=");
  });

  it("returns the unwrapped page", async () => {
    const page = { items: [], nextCursor: "next" };
    mockGet.mockResolvedValue({ data: { data: page } });
    await expect(getPostPage()).resolves.toEqual(page);
  });
});

describe("searchPosts", () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({
      data: { data: { items: [], hasMore: false } },
    });
  });

  function searchParamsSent() {
    const url = mockGet.mock.calls[0][0] as string;
    expect(url.startsWith("/posts/search?")).toBe(true);
    return new URLSearchParams(url.slice("/posts/search?".length));
  }

  it("sends the term and the backend's maximum limit by default", async () => {
    await searchPosts({ q: "react" });
    const params = searchParamsSent();
    expect(params.get("q")).toBe("react");
    expect(params.get("limit")).toBe(String(SEARCH_MAX_LIMIT));
  });

  it("sends a limit when given one", async () => {
    await searchPosts({ q: "react", limit: 5 });
    expect(searchParamsSent().get("limit")).toBe("5");
  });

  it("encodes special characters in the term", async () => {
    await searchPosts({ q: 'c++ & "hooks" -class %' });
    const url = mockGet.mock.calls[0][0] as string;
    expect(url).not.toContain("&hooks");
    expect(url).not.toContain(" ");
    expect(searchParamsSent().get("q")).toBe('c++ & "hooks" -class %');
  });

  it("forwards the abort signal to axios", async () => {
    const controller = new AbortController();
    await searchPosts({ q: "react", signal: controller.signal });
    expect(mockGet.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it("returns the unwrapped page", async () => {
    const page = { items: [], hasMore: true };
    mockGet.mockResolvedValue({ data: { data: page } });
    await expect(searchPosts({ q: "react" })).resolves.toEqual(page);
  });
});

describe("summarizePost", () => {
  const summary = {
    summary: "A short summary.",
    tags: ["React"],
    source: "mock",
    truncated: false,
  };

  beforeEach(() => {
    mockPost.mockResolvedValue({ data: { data: summary } });
  });

  it("posts to the post's summarize route with no body", async () => {
    await summarizePost("abc123");
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe("/posts/abc123/summarize");
    expect(body).toBeUndefined();
  });

  it("gives the request its own timeout, longer than the backend's maximum", async () => {
    await summarizePost("abc123");
    expect(mockPost.mock.calls[0][2]).toEqual({
      timeout: SUMMARIZE_TIMEOUT_MS,
    });
    expect(SUMMARIZE_TIMEOUT_MS).toBeGreaterThan(15_000);
  });

  it("encodes the id so it can't change the path", async () => {
    await summarizePost("a/b?c");
    expect(mockPost.mock.calls[0][0]).toBe("/posts/a%2Fb%3Fc/summarize");
  });

  it("returns the unwrapped summary", async () => {
    await expect(summarizePost("abc123")).resolves.toEqual(summary);
  });
});
