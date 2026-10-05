import axios, {
  AxiosError,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from "axios";
import { ApiError } from "./api-error";
import { REFRESH_URL, attachInterceptors } from "./interceptors";
import { markSignedIn, markSignedOut } from "./session-state";

// The real interceptors on a real axios instance. Only the transport is fake:
// a custom adapter plays the backend, answering from a tiny in-memory model of
// a session ("is the access token still good", "what does /auth/refresh say").
// What this cannot show is a browser: the default redirect (a full page load to
// /login?reason=session-expired) is replaced by a spy, and the cookies are not
// real. Those are checked by hand against the running app.

type Reply = { status: number; data?: unknown } | "network-error";

type World = {
  // Does the current access token still work on protected routes?
  accessValid: boolean;
  // What POST /auth/refresh answers. On a 200 the access token becomes valid.
  refresh: Reply;
};

function setup(
  overrides: Partial<World> = {},
  extra?: (
    config: InternalAxiosRequestConfig,
    world: World,
  ) => Promise<Reply | undefined> | Reply | undefined,
) {
  const world: World = {
    accessValid: false,
    refresh: { status: 200 },
    ...overrides,
  };
  const calls: string[] = [];
  const bodies: unknown[] = [];

  const adapter: AxiosAdapter = async (config) => {
    const label = `${config.method?.toUpperCase()} ${config.url}`;
    calls.push(label);
    bodies.push(config.data);
    // A loop would otherwise spin forever and starve Jest's own timeout, so
    // it is turned into an ordinary failure here.
    if (calls.length > 50) throw new Error("runaway request loop");

    let reply: Reply | undefined = await extra?.(config, world);
    if (!reply) {
      if (config.url === REFRESH_URL) {
        reply = world.refresh;
        if (reply !== "network-error" && reply.status === 200) {
          world.accessValid = true;
        }
      } else {
        reply = world.accessValid
          ? { status: 200, data: { ok: true } }
          : { status: 401, data: { message: "Unauthorized", errors: [] } };
      }
    }

    if (reply === "network-error") {
      throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config);
    }
    const response = {
      data: reply.data ?? {},
      status: reply.status,
      statusText: "",
      headers: {},
      config,
    };
    if (reply.status >= 200 && reply.status < 300) return response;
    throw new AxiosError(
      `status ${reply.status}`,
      AxiosError.ERR_BAD_REQUEST,
      config,
      null,
      response,
    );
  };

  const client = axios.create({ adapter, baseURL: "http://api.test" });
  const redirectToLogin = jest.fn();
  attachInterceptors(client, { redirectToLogin });

  const count = (label: string) => calls.filter((c) => c === label).length;
  return { client, world, calls, bodies, redirectToLogin, count };
}

const PROTECTED = "GET /posts/mine";
const REFRESH = `POST ${REFRESH_URL}`;

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("expected the request to fail");
}

// A refresh that is running, held back until the test lets it finish, so a
// sign-out can be made to happen while it is in flight.
function heldRefresh(reply: Reply) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let started: () => void = () => undefined;
  const refreshStarted = new Promise<void>((resolve) => (started = resolve));

  const extra = async (
    config: InternalAxiosRequestConfig,
  ): Promise<Reply | undefined> => {
    if (config.url !== REFRESH_URL) return undefined;
    started();
    await gate;
    return reply;
  };
  return { extra, refreshStarted, release };
}

describe("attachInterceptors", () => {
  // The signed-out flag is module state shared by every client, so no test may
  // leave it set for the next one.
  beforeEach(() => markSignedIn());
  afterEach(() => markSignedIn());

  describe("a request that works", () => {
    it("passes through untouched, with no refresh", async () => {
      const { client, calls } = setup({ accessValid: true });

      const res = await client.get("/posts/mine");

      expect(res.data).toEqual({ ok: true });
      expect(calls).toEqual([PROTECTED]);
    });
  });

  describe("an expired access token", () => {
    it("refreshes once and sends the original request again once", async () => {
      const { client, calls, redirectToLogin } = setup();

      const res = await client.get("/posts/mine");

      expect(res.data).toEqual({ ok: true });
      expect(calls).toEqual([PROTECTED, REFRESH, PROTECTED]);
      expect(redirectToLogin).not.toHaveBeenCalled();
    });

    it("sends the repeated request with the same body", async () => {
      const { client, bodies } = setup();

      await client.post("/posts", { title: "Hello" });

      // POST /posts, POST /auth/refresh, POST /posts
      expect(bodies[0]).toBe(bodies[2]);
      expect(String(bodies[0])).toContain("Hello");
    });

    it("starts one refresh for several requests that fail together", async () => {
      const { client, calls, count, redirectToLogin } = setup();

      const results = await Promise.all(
        Array.from({ length: 5 }, () => client.get("/posts/mine")),
      );

      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(count(REFRESH)).toBe(1);
      expect(count(PROTECTED)).toBe(10); // 5 that failed + 5 repeats
      expect(calls).toHaveLength(11);
      expect(redirectToLogin).not.toHaveBeenCalled();
    });

    it("does not refresh again for a 401 that belongs to a request sent before the last refresh finished", async () => {
      let releaseSlow: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (releaseSlow = resolve));

      // /slow is sent while the token is still expired, and its (401) answer is
      // held back until after the refresh has completed.
      const { client, count } = setup({}, async (config, world) => {
        if (config.url !== "/slow") return undefined;
        const validWhenSent = world.accessValid;
        await gate;
        return validWhenSent
          ? { status: 200, data: { ok: true } }
          : { status: 401 };
      });

      const slow = client.get("/slow");
      await client.get("/posts/mine"); // 401 -> refresh -> repeat
      expect(count(REFRESH)).toBe(1);

      releaseSlow();
      const res = await slow; // 401, but stale: repeated, not refreshed

      expect(res.status).toBe(200);
      expect(count(REFRESH)).toBe(1);
      expect(count("GET /slow")).toBe(2);
    });

    it("refreshes again when the token expires again later", async () => {
      const { client, world, count } = setup();

      await client.get("/posts/mine");
      expect(count(REFRESH)).toBe(1);

      world.accessValid = false; // expired a second time
      await client.get("/posts/mine");

      expect(count(REFRESH)).toBe(2);
    });
  });

  describe("no loop", () => {
    it("repeats a request at most once: a 401 on the repeat does not refresh again", async () => {
      // The refresh succeeds but the access token is still rejected.
      const { client, calls, redirectToLogin } = setup({}, (config, world) => {
        if (config.url === REFRESH_URL) return { status: 200 };
        world.accessValid = false;
        return undefined;
      });

      const error = await failure(client.get("/posts/mine"));

      expect(error.status).toBe(401);
      expect(calls).toEqual([PROTECTED, REFRESH, PROTECTED]);
      expect(redirectToLogin).toHaveBeenCalledTimes(1);
    });

    it("never refreshes because the refresh request itself failed with 401", async () => {
      const { client, count } = setup({ refresh: { status: 401 } });

      await failure(client.get("/posts/mine"));

      expect(count(REFRESH)).toBe(1);
    });

    it("a call that opted out of refreshing makes exactly one request", async () => {
      const { client, calls, redirectToLogin } = setup();

      const error = await failure(
        client.post("/auth/login", {}, {
          skipAuthRefresh: true,
          skipAuthRedirect: true,
        }),
      );

      expect(error.status).toBe(401);
      expect(calls).toEqual(["POST /auth/login"]);
      expect(redirectToLogin).not.toHaveBeenCalled();
    });

    it("an opted-out call that can redirect still sends the visitor to login", async () => {
      const { client, calls, redirectToLogin } = setup();

      await failure(client.get("/posts/mine", { skipAuthRefresh: true }));

      expect(calls).toEqual([PROTECTED]);
      expect(redirectToLogin).toHaveBeenCalledTimes(1);
    });
  });

  describe("a session that is over (the refresh is a 401)", () => {
    it("rejects with the original 401 and goes to login", async () => {
      const { client, calls, redirectToLogin } = setup({
        refresh: { status: 401 },
      });

      const error = await failure(client.get("/posts/mine"));

      expect(error.status).toBe(401);
      expect(error.message).toBe("Unauthorized");
      expect(calls).toEqual([PROTECTED, REFRESH]); // no repeat
      expect(redirectToLogin).toHaveBeenCalledTimes(1);
    });

    it("refreshes once and goes to login once for several requests failing together", async () => {
      const { client, count, redirectToLogin } = setup({
        refresh: { status: 401 },
      });

      const errors = await Promise.all(
        Array.from({ length: 4 }, () => failure(client.get("/posts/mine"))),
      );

      expect(errors.every((e) => e.status === 401)).toBe(true);
      expect(count(REFRESH)).toBe(1);
      expect(count(PROTECTED)).toBe(4); // none repeated
      expect(redirectToLogin).toHaveBeenCalledTimes(1);
    });

    it("does not redirect for a call that handles its own 401 (like /auth/me)", async () => {
      const { client, count, redirectToLogin } = setup({
        refresh: { status: 401 },
      });

      const error = await failure(
        client.get("/auth/me", { skipAuthRedirect: true }),
      );

      expect(error.status).toBe(401);
      expect(count(REFRESH)).toBe(1); // it still tried to recover first
      expect(redirectToLogin).not.toHaveBeenCalled();
    });

    it("still recovers on a later request if the next refresh works", async () => {
      const { client, world, count } = setup({ refresh: { status: 401 } });
      await failure(client.get("/posts/mine"));

      world.refresh = { status: 200 };
      const res = await client.get("/posts/mine");

      expect(res.status).toBe(200);
      expect(count(REFRESH)).toBe(2); // the failed one did not stay "in flight"
    });
  });

  describe("a refresh that fails for another reason", () => {
    it.each([
      ["429 Too Many Requests", { status: 429, data: { message: "Too many" } }, 429],
      ["500 Server Error", { status: 500 }, 500],
      ["a network failure", "network-error" as const, undefined],
    ])(
      "%s: stays signed in, shows that error, no repeat, no redirect",
      async (_label, refresh, expectedStatus) => {
        const { client, calls, redirectToLogin } = setup({
          refresh: refresh as Reply,
        });

        const error = await failure(client.get("/posts/mine"));

        expect(error.status).toBe(expectedStatus);
        expect(calls).toEqual([PROTECTED, REFRESH]);
        expect(redirectToLogin).not.toHaveBeenCalled();
      },
    );
  });

  describe("other errors", () => {
    it.each([400, 403, 404, 409, 500])(
      "a %i is normalized to an ApiError with no refresh and no redirect",
      async (status) => {
        const { client, calls, redirectToLogin } = setup(
          { accessValid: true },
          () => ({
            status,
            data: { message: "nope", errors: ["field is wrong"] },
          }),
        );

        const error = await failure(client.get("/posts/mine"));

        expect(error.status).toBe(status);
        expect(error.message).toBe("nope");
        expect(error.errors).toEqual(["field is wrong"]);
        expect(calls).toEqual([PROTECTED]);
        expect(redirectToLogin).not.toHaveBeenCalled();
      },
    );

    it("a network failure with no response has no status and no refresh", async () => {
      const { client, calls } = setup({}, () => "network-error");

      const error = await failure(client.get("/posts/mine"));

      expect(error.status).toBeUndefined();
      expect(error.message).toBe("Request failed");
      expect(calls).toEqual([PROTECTED]);
    });
  });

  // After the user clicks Logout their cookies are gone on purpose, so a 401
  // from a protected call that is still running (the notification bell polls
  // one) is expected. It must not be mistaken for an expired session, which
  // would send them to /login?reason=session-expired.
  describe("after a deliberate sign-out", () => {
    it("a protected 401 is just an error: no refresh and no redirect", async () => {
      markSignedOut();
      const { client, calls, redirectToLogin } = setup();

      const error = await failure(client.get("/posts/mine"));

      expect(error.status).toBe(401);
      expect(error.message).toBe("Unauthorized");
      expect(calls).toEqual([PROTECTED]);
      expect(redirectToLogin).not.toHaveBeenCalled();
    });

    it("the same for a call that opted out of refreshing but not out of the redirect", async () => {
      markSignedOut();
      const { client, calls, redirectToLogin } = setup();

      const error = await failure(
        client.get("/posts/mine", { skipAuthRefresh: true }),
      );

      expect(error.status).toBe(401);
      expect(calls).toEqual([PROTECTED]);
      expect(redirectToLogin).not.toHaveBeenCalled();
    });

    it("a refresh already running when the user signs out can come back 401 without a redirect", async () => {
      const held = heldRefresh({ status: 401 });
      const { client, calls, redirectToLogin } = setup({}, held.extra);

      const pending = failure(client.get("/posts/mine")); // 401 -> refresh starts
      await held.refreshStarted;
      markSignedOut(); // the user clicks Logout while it is in flight
      held.release();
      const error = await pending;

      expect(error.status).toBe(401);
      expect(error.message).toBe("Unauthorized"); // the original 401
      expect(calls).toEqual([PROTECTED, REFRESH]);
      expect(redirectToLogin).not.toHaveBeenCalled();
    });

    it("a refresh that succeeds after the user signed out is not followed by a repeat", async () => {
      const held = heldRefresh({ status: 200 });
      const { client, calls, redirectToLogin } = setup({}, held.extra);

      const pending = failure(client.get("/posts/mine"));
      await held.refreshStarted;
      markSignedOut();
      held.release();
      const error = await pending;

      expect(error.status).toBe(401);
      expect(calls).toEqual([PROTECTED, REFRESH]); // no second PROTECTED
      expect(redirectToLogin).not.toHaveBeenCalled();
    });

    it("leaves a request that works untouched", async () => {
      markSignedOut();
      const { client, calls } = setup({ accessValid: true });

      const res = await client.get("/posts/mine");

      expect(res.data).toEqual({ ok: true });
      expect(calls).toEqual([PROTECTED]);
    });

    it("leaves other errors untouched", async () => {
      markSignedOut();
      const { client, redirectToLogin } = setup({ accessValid: true }, () => ({
        status: 500,
        data: { message: "boom", errors: [] },
      }));

      const error = await failure(client.get("/posts/mine"));

      expect(error.status).toBe(500);
      expect(error.message).toBe("boom");
      expect(redirectToLogin).not.toHaveBeenCalled();
    });

    it("signing in again switches the normal behaviour back on: refresh, then repeat", async () => {
      markSignedOut();
      markSignedIn();
      const { client, calls, redirectToLogin } = setup();

      const res = await client.get("/posts/mine");

      expect(res.status).toBe(200);
      expect(calls).toEqual([PROTECTED, REFRESH, PROTECTED]);
      expect(redirectToLogin).not.toHaveBeenCalled();
    });

    it("and a session that is really over goes to login once again", async () => {
      markSignedOut();
      markSignedIn();
      const { client, redirectToLogin } = setup({ refresh: { status: 401 } });

      await failure(client.get("/posts/mine"));

      expect(redirectToLogin).toHaveBeenCalledTimes(1);
    });
  });
});
