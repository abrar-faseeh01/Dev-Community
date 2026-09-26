import { authKeys } from "@/features/auth/queries/auth-queries";
import type { AuthUser } from "@/features/auth/types/user";
import { QueryClient } from "@tanstack/react-query";
import { currentUserId, isSameSession } from "./session-guard";

const USER: AuthUser = {
  id: "u1",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  role: "user",
};

describe("currentUserId", () => {
  it("returns the signed-in user's id", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(authKeys.me, USER);
    expect(currentUserId(queryClient)).toBe("u1");
  });

  it("returns null when nobody is signed in", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(authKeys.me, null);
    expect(currentUserId(queryClient)).toBeNull();
  });

  it("returns null when the query has never run", () => {
    const queryClient = new QueryClient();
    expect(currentUserId(queryClient)).toBeNull();
  });
});

describe("isSameSession", () => {
  it("is true when the given user is still signed in", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(authKeys.me, USER);
    expect(isSameSession(queryClient, "u1")).toBe(true);
  });

  it("is false when a different user is signed in now", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(authKeys.me, {
      ...USER,
      id: "u2",
    } satisfies AuthUser);
    expect(isSameSession(queryClient, "u1")).toBe(false);
  });

  it("is false for a null userId even if someone is signed in", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(authKeys.me, USER);
    expect(isSameSession(queryClient, null)).toBe(false);
  });

  it("is false for a null userId when nobody is signed in either", () => {
    // null === null must not count as "the same session": a mutation that
    // never captured a user has nothing to be the same as.
    const queryClient = new QueryClient();
    queryClient.setQueryData(authKeys.me, null);
    expect(isSameSession(queryClient, null)).toBe(false);
  });
});
