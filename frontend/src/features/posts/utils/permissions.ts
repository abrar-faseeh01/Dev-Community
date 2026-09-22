// The one place that decides what a viewer may do to a post in the UI. The
// feed card, detail page, edit page, and delete flow all read this, so
// "who sees Edit/Delete" can't drift between them. The backend's
// owner-or-admin check on PATCH/DELETE is the real security boundary — this
// only decides what to offer, and a server 403 is still handled separately.

// "owner"     — the post's author. This includes an admin acting on their own
//               post: no override styling, no reason field, and the backend
//               records no audit entry (isAdminOverride is false for them).
// "moderator" — an admin acting on someone else's post. Gets the "as admin"
//               UI and the optional reason field.
export type PostActor = "owner" | "moderator";

type Viewer = { id: string; role: "admin" | "user" } | null;

// A null viewer covers both "logged out" and "auth still loading", so
// controls never flash before the session is known.
export function getPostActor(
  viewer: Viewer,
  // A deleted author has a null id, which never equals a viewer's id.
  post: { author: { id: string | null } },
): PostActor | null {
  if (!viewer) return null;
  if (viewer.id === post.author.id) return "owner";
  if (viewer.role === "admin") return "moderator";
  return null;
}
