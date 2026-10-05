import { apiClient } from "@/lib/axios/client";
import { getMe, login, logout, signup, updateCredentials } from "./auth";

// Which 401 behavior each auth call asks the interceptor for. These flags are
// what keep the refresh flow from looping or misfiring (see the long comment in
// auth.ts and lib/axios/interceptors.test.ts for what each one does), so a
// change to them should fail here and be deliberate.
jest.mock("@/lib/axios/client");

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const USER = { id: "u1", fullName: "Ada", email: "ada@example.com", role: "user" };

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { data: USER } });
  post.mockResolvedValue({ data: { data: USER } });
  patch.mockResolvedValue({ data: { data: USER } });
});

// The request config is the last argument of each call.
const configOf = (mock: jest.Mock) => mock.mock.calls[0].at(-1);

describe("auth service request flags", () => {
  it("getMe: no redirect on 401 (it is how the app learns nobody is signed in), but it may refresh", async () => {
    await getMe();

    expect(configOf(get)).toEqual({ skipAuthRedirect: true });
  });

  it("login: neither redirects nor refreshes (a 401 means a wrong password)", async () => {
    await login({ email: "a@b.co", password: "pw" });

    expect(configOf(post)).toEqual({
      skipAuthRedirect: true,
      skipAuthRefresh: true,
    });
  });

  it("signup: neither redirects nor refreshes", async () => {
    await signup({ fullName: "Ada", email: "a@b.co", password: "pw" });

    expect(configOf(post)).toEqual({
      skipAuthRedirect: true,
      skipAuthRefresh: true,
    });
  });

  it("updateCredentials: sets no flags, so an expired session refreshes and retries", async () => {
    await updateCredentials({ currentPassword: "pw", newFullName: "Ada K." });

    expect(patch.mock.calls[0]).toHaveLength(2); // url and body, no config
  });

  it("logout: sets no flags", async () => {
    await logout();

    expect(post.mock.calls[0]).toEqual(["/auth/logout"]);
  });
});
