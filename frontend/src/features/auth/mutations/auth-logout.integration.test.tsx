import { useUnreadCount } from "@/features/notifications/queries/notification-queries";
import { attachInterceptors } from "@/lib/axios/interceptors";
import { markSignedIn } from "@/lib/axios/session-state";
import { createQueryClient } from "@/lib/tanstack/query-client";
import { getUnreadCount } from "@/services/api/notifications";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { useRouter } from "next/navigation";
import { useAuth } from "../hooks/use-auth";
import { useLogin, useLogout } from "./auth-mutations";

// Reproduces the bug where clicking Logout landed on
// /login?reason=session-expired. The pieces are the real ones: the real
// mutation hooks, the real notification-bell query and its service, the real
// query client factory, and the real axios interceptors. Only the network is
// fake (an in-memory backend behind an axios adapter) and the router.
//
// The harness (Shell) mirrors components/layout/header.tsx: nothing while the
// current user loads, the bell and a logout button while there is a user, and
// the bell is removed the moment there is no user. That removal is what makes
// the race real: logout's resetQueries refetches the bell's query while the bell
// is still mounted, with the cookies already gone.
//
// What this cannot show: a browser. The redirect is a spy (the real one is a
// full page load) and the cookies are a boolean. The sequence in a real tab is
// checked by hand in DevTools.
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

// The app's one axios client, replaced by a thin delegate to a client the tests
// rebuild before each test. A fresh client matters: the interceptor remembers
// that it already redirected (once per page load in a real tab), so one shared
// client would let the first test's redirect hide the next one's. A variable
// used inside a jest.mock factory must start with "mock"; it is only read when
// a request is made.
let mockCurrentClient: AxiosInstance;
jest.mock("@/lib/axios/client", () => ({
  apiClient: {
    get: (...args: Parameters<AxiosInstance["get"]>) =>
      mockCurrentClient.get(...args),
    post: (...args: Parameters<AxiosInstance["post"]>) =>
      mockCurrentClient.post(...args),
    patch: (...args: Parameters<AxiosInstance["patch"]>) =>
      mockCurrentClient.patch(...args),
    put: (...args: Parameters<AxiosInstance["put"]>) =>
      mockCurrentClient.put(...args),
    delete: (...args: Parameters<AxiosInstance["delete"]>) =>
      mockCurrentClient.delete(...args),
  },
}));

const mockRedirect = jest.fn();
const push = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

const USER = {
  id: "u1",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  role: "user",
};

// The fake backend's whole state. `cookies` is "does the browser still hold a
// working session": logout drops it, and with it gone every protected route and
// /auth/refresh answer 401, as the real server does.
const world = {
  cookies: true,
  logoutStatus: 200,
  calls: [] as string[],
};

function resetWorld() {
  world.cookies = true;
  world.logoutStatus = 200;
  world.calls = [];
}

function respond(
  config: InternalAxiosRequestConfig,
  status: number,
  body: unknown,
) {
  const response = { data: body, status, statusText: "", headers: {}, config };
  if (status >= 200 && status < 300) return response;
  throw new AxiosError(
    `status ${status}`,
    AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    response,
  );
}

const ok = (config: InternalAxiosRequestConfig, data: unknown) =>
  respond(config, 200, { success: true, data });

const fail = (
  config: InternalAxiosRequestConfig,
  status: number,
  message: string,
) => respond(config, status, { success: false, statusCode: status, message, errors: [] });

const handle: AxiosAdapter = async (config) => {
  const label = `${config.method?.toUpperCase()} ${config.url}`;
  world.calls.push(label);
  // A loop would spin forever and starve Jest's own timeout; make it a failure.
  if (world.calls.length > 60) throw new Error("runaway request loop");

  switch (label) {
    case "GET /auth/me":
      return world.cookies ? ok(config, USER) : fail(config, 401, "Unauthorized");
    case "GET /notifications/unread-count":
      return world.cookies ? ok(config, 3) : fail(config, 401, "Unauthorized");
    case "POST /auth/refresh":
      return world.cookies ? ok(config, USER) : fail(config, 401, "Unauthorized");
    case "POST /auth/login":
      world.cookies = true;
      return ok(config, USER);
    case "POST /auth/logout":
      if (world.logoutStatus !== 200) {
        return fail(config, world.logoutStatus, "Server error");
      }
      world.cookies = false;
      return ok(config, null);
    default:
      return fail(config, 404, `no route for ${label}`);
  }
};

function resetClient() {
  mockCurrentClient = axios.create({
    adapter: handle,
    baseURL: "http://api.test",
  });
  attachInterceptors(mockCurrentClient, { redirectToLogin: mockRedirect });
}

const LOGOUT = "POST /auth/logout";
const UNREAD = "GET /notifications/unread-count";
const REFRESH = "POST /auth/refresh";

const count = (label: string) => world.calls.filter((c) => c === label).length;
const callsFrom = (label: string) =>
  world.calls.slice(world.calls.indexOf(label));

// Long enough for a request, the interceptor's refresh and its redirect to all
// happen if they are going to (they are a few microtasks in this setup).
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

function Bell() {
  const unread = useUnreadCount(USER.id).data ?? 0;
  return <span data-testid="unread">{unread}</span>;
}

function LogoutButton() {
  const logout = useLogout();
  return <button onClick={() => logout.mutate()}>Log out</button>;
}

function LoginButton() {
  const login = useLogin();
  return (
    <button
      onClick={() => login.mutate({ email: USER.email, password: "pw" })}
    >
      Log in
    </button>
  );
}

function Shell() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? (
    <>
      <Bell />
      <LogoutButton />
    </>
  ) : (
    <>
      <p>signed out</p>
      <LoginButton />
    </>
  );
}

function renderApp() {
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>,
  );
  return queryClient;
}

const waitForBell = () =>
  waitFor(() =>
    expect(screen.getByTestId("unread")).toHaveTextContent("3"),
  );

beforeEach(() => {
  jest.clearAllMocks();
  resetWorld();
  resetClient();
  markSignedIn();
  mockUseRouter.mockReturnValue({ push } as unknown as ReturnType<
    typeof useRouter
  >);
});

afterEach(() => markSignedIn());

describe("logging out", () => {
  it("is not reported as an expired session", async () => {
    const user = userEvent.setup();
    renderApp();
    await waitForBell();

    await user.click(screen.getByRole("button", { name: "Log out" }));
    await screen.findByText("signed out");

    // The control: the bell's query really was refetched after logout, with
    // the cookies already gone. Without this the test could pass because
    // nothing was ever requested, which would prove nothing.
    await waitFor(() =>
      expect(callsFrom(LOGOUT)).toEqual([LOGOUT, UNREAD]),
    );
    await settle();

    // That request 401s, and the interceptor must leave it at that: no refresh
    // attempt, no redirect to /login?reason=session-expired.
    expect(callsFrom(LOGOUT)).toEqual([LOGOUT, UNREAD]);
    expect(count(REFRESH)).toBe(0);
    expect(mockRedirect).not.toHaveBeenCalled();
    // The only navigation is the deliberate one from useLogout.
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("does not hide a session that really expires mid-use", async () => {
    const queryClient = renderApp();
    await waitForBell();

    world.cookies = false; // both tokens are gone: the session expired
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });

    await waitFor(() => expect(mockRedirect).toHaveBeenCalledTimes(1));
    expect(count(REFRESH)).toBe(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("a logout that fails does not hide real expiry afterwards", async () => {
    world.logoutStatus = 500; // the request fails and the session is untouched
    const user = userEvent.setup();
    const queryClient = renderApp();
    await waitForBell();

    await user.click(screen.getByRole("button", { name: "Log out" }));
    await screen.findByText("signed out"); // still signed out locally
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    await settle();
    expect(world.cookies).toBe(true); // the server never ended the session
    expect(mockRedirect).not.toHaveBeenCalled();

    // Later the session really expires, and a protected call finds out.
    world.cookies = false;
    await act(async () => {
      await queryClient
        .fetchQuery({ queryKey: ["probe"], queryFn: getUnreadCount })
        .catch(() => undefined);
    });

    await waitFor(() => expect(mockRedirect).toHaveBeenCalledTimes(1));
  });

  it("signing in again brings real expiry handling back", async () => {
    const user = userEvent.setup();
    const queryClient = renderApp();
    await waitForBell();
    await user.click(screen.getByRole("button", { name: "Log out" }));
    await screen.findByText("signed out");
    await settle();
    expect(mockRedirect).not.toHaveBeenCalled(); // the logout itself was quiet

    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitForBell(); // the new session's bell loaded normally

    world.cookies = false; // and now that session expires
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });

    await waitFor(() => expect(mockRedirect).toHaveBeenCalledTimes(1));
  });
});
