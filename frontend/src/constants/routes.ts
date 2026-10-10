// The `reason` query value on /login that says the visitor was sent there
// because their session ended (not because they never signed in). The
// axios interceptor appends it; the login page reads it to show a notice.
export const LOGIN_REASON_PARAM = "reason";
export const LOGIN_REASON_SESSION_EXPIRED = "session-expired";

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  LOGIN_SESSION_EXPIRED: `/login?${LOGIN_REASON_PARAM}=${LOGIN_REASON_SESSION_EXPIRED}`,
  SIGNUP: "/signup",
  SETTINGS: "/settings",
  POSTS: "/posts",
  POSTS_CREATE: "/posts/create",
  POSTS_MINE: "/posts/mine",
  CHANGELOG: "/changelog",
  PROFILE_EDIT: "/profile/edit",
  ADMIN_USERS: "/admin/users",
  ADMIN_AUDIT_LOG: "/admin/audit-log",
  post: (id: string) => `/posts/${id}`,
  postEdit: (id: string) => `/posts/${id}/edit`,
  profile: (id: string) => `/profile/${id}`,
  profileEdit: (id: string) => `/profile/edit/${id}`,
  profileEditExperience: (id: string) => `/profile/edit/${id}/experience`,
  profileEditSkills: (id: string) => `/profile/edit/${id}#skills`,
  profileEditPortfolio: (id: string) => `/profile/edit/${id}#portfolio`,
} as const;
