import {
  getMe,
  login,
  logout,
  signup,
  updateCredentials,
} from "@/services/api/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authKeys, useCurrentUser } from "../queries/auth-queries";
import type { AuthUser } from "../types/user";
import {
  useLogin,
  useLogout,
  useSignup,
  useUpdateCredentials,
} from "./auth-mutations";

jest.mock("@/services/api/auth");
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockGetMe = getMe as jest.MockedFunction<typeof getMe>;
const mockLogin = login as jest.MockedFunction<typeof login>;
const mockSignup = signup as jest.MockedFunction<typeof signup>;
const mockLogout = logout as jest.MockedFunction<typeof logout>;
const mockUpdateCredentials = updateCredentials as jest.MockedFunction<
  typeof updateCredentials
>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

const USER: AuthUser = {
  id: "u1",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  role: "user",
};

const OTHER_USER: AuthUser = {
  id: "u2",
  fullName: "Grace Hopper",
  email: "grace@example.com",
  role: "user",
};

// Stand in for the kind of per-viewer data a session change must not leave
// behind — a cached feed page and a cached comment tree.
const STALE_FEED_KEY = ["posts", "feed"];
const STALE_COMMENTS_KEY = ["comments", "list", "p1"];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(STALE_FEED_KEY, { pages: ["stale-feed"] });
  queryClient.setQueryData(STALE_COMMENTS_KEY, ["stale-comment"]);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { queryClient, Wrapper };
}

const push = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRouter.mockReturnValue({
    push,
  } as unknown as ReturnType<typeof useRouter>);
});

describe("useLogin", () => {
  it("clears non-auth caches and stores the signed-in user", async () => {
    mockLogin.mockResolvedValue(USER);
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useLogin(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ email: "ada@example.com", password: "pw" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(STALE_FEED_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(STALE_COMMENTS_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(authKeys.me)).toEqual(USER);
  });

  it("resets non-auth queries before writing the new user, not after", async () => {
    mockLogin.mockResolvedValue(USER);
    const { queryClient, Wrapper } = createWrapper();
    const resetSpy = jest.spyOn(queryClient, "resetQueries");
    const setSpy = jest.spyOn(queryClient, "setQueryData");
    const { result } = renderHook(() => useLogin(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ email: "ada@example.com", password: "pw" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const authWriteIndex = setSpy.mock.calls.findIndex(
      ([key]) => key === authKeys.me,
    );
    expect(authWriteIndex).toBeGreaterThanOrEqual(0);
    expect(resetSpy.mock.invocationCallOrder[0]).toBeLessThan(
      setSpy.mock.invocationCallOrder[authWriteIndex],
    );
  });
});

describe("a session change and the current-user query", () => {
  it("writes the new user without refetching /auth/me", async () => {
    mockLogin.mockResolvedValue(USER);
    const { queryClient, Wrapper } = createWrapper();
    // Signed out, as on /login: the entry exists and never goes stale.
    queryClient.setQueryData(authKeys.me, null);
    const { result } = renderHook(
      () => ({ me: useCurrentUser(), login: useLogin() }),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.login.mutate({ email: "ada@example.com", password: "pw" });
    });
    await waitFor(() => expect(result.current.login.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.me.data).toEqual(USER));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Resetting the auth entry too would make the mounted query fetch again,
    // and the header would flash its loading state for no reason.
    expect(mockGetMe).not.toHaveBeenCalled();
    expect(result.current.me.isPending).toBe(false);
  });
});

describe("useSignup", () => {
  it("logs the new account in, then clears non-auth caches and stores the user", async () => {
    mockSignup.mockResolvedValue(undefined);
    mockLogin.mockResolvedValue(USER);
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSignup(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({
        fullName: "Ada",
        email: "ada@example.com",
        password: "pw",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(STALE_FEED_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(STALE_COMMENTS_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(authKeys.me)).toEqual(USER);
  });
});

describe("useLogout", () => {
  it("clears non-auth caches, nulls the auth entry and navigates to /login on success", async () => {
    mockLogout.mockResolvedValue(undefined);
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useLogout(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(STALE_FEED_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(authKeys.me)).toBeNull();
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("still clears the session and navigates when the request itself fails", async () => {
    mockLogout.mockRejectedValue(new Error("network down"));
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useLogout(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(STALE_FEED_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(authKeys.me)).toBeNull();
    expect(push).toHaveBeenCalledWith("/login");
  });
});

describe("useUpdateCredentials", () => {
  it("updates the auth entry without touching other caches", async () => {
    mockUpdateCredentials.mockResolvedValue(OTHER_USER);
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateCredentials(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({
        currentPassword: "pw",
        newFullName: "Grace Hopper",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(STALE_FEED_KEY)).toEqual({
      pages: ["stale-feed"],
    });
    expect(queryClient.getQueryData(STALE_COMMENTS_KEY)).toEqual([
      "stale-comment",
    ]);
    expect(queryClient.getQueryData(authKeys.me)).toEqual(OTHER_USER);
  });
});
