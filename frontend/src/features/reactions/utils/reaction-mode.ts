import type { ReactionButtonsMode } from "../components/reaction-buttons";

type ReactionModeInput = {
  user: { role: "admin" | "user" } | null;
  loading: boolean;
};

// Read-only while auth is still loading (nobody should see active buttons
// before we know who they are), signed-out shows the sign-in hint, admin is
// read-only the same as posts/comments themselves, and a regular signed-in
// user gets the real buttons.
export function getReactionMode({
  user,
  loading,
}: ReactionModeInput): ReactionButtonsMode {
  if (loading) return "read-only";
  if (!user) return "signed-out";
  if (user.role === "admin") return "read-only";
  return "interactive";
}
