import { getReactionMode } from "./reaction-mode";

describe("getReactionMode", () => {
  it("is read-only while auth is loading, regardless of user", () => {
    expect(getReactionMode({ user: null, loading: true })).toBe("read-only");
    expect(getReactionMode({ user: { role: "user" }, loading: true })).toBe(
      "read-only",
    );
  });

  it("is signed-out when there's no user", () => {
    expect(getReactionMode({ user: null, loading: false })).toBe("signed-out");
  });

  it("is read-only for an admin", () => {
    expect(getReactionMode({ user: { role: "admin" }, loading: false })).toBe(
      "read-only",
    );
  });

  it("is interactive for a regular user", () => {
    expect(getReactionMode({ user: { role: "user" }, loading: false })).toBe(
      "interactive",
    );
  });
});
