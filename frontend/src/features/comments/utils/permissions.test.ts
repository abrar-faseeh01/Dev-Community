import { canComment, getCommentActor } from "./permissions";

const AUTHOR = { id: "author-1", role: "user" as const };
const ADMIN = { id: "admin-1", role: "admin" as const };
const POST_OWNER = { id: "post-owner-1", role: "user" as const };
const UNRELATED = { id: "unrelated-1", role: "user" as const };

const comment = { author: { id: AUTHOR.id } };

describe("getCommentActor", () => {
  it("returns 'author' for the comment's own author", () => {
    expect(getCommentActor(AUTHOR, comment, POST_OWNER.id)).toBe("author");
  });

  it("returns 'admin' for an admin who isn't the author", () => {
    expect(getCommentActor(ADMIN, comment, POST_OWNER.id)).toBe("admin");
  });

  it("returns 'post-owner' for the post's author when they're neither the comment's author nor an admin", () => {
    expect(getCommentActor(POST_OWNER, comment, POST_OWNER.id)).toBe(
      "post-owner",
    );
  });

  it("returns null for an unrelated logged-in user", () => {
    expect(getCommentActor(UNRELATED, comment, POST_OWNER.id)).toBeNull();
  });

  it("returns null when logged out", () => {
    expect(getCommentActor(null, comment, POST_OWNER.id)).toBeNull();
  });

  it("prefers 'author' over 'post-owner' when a user comments on their own post", () => {
    const ownPostComment = { author: { id: AUTHOR.id } };
    expect(getCommentActor(AUTHOR, ownPostComment, AUTHOR.id)).toBe("author");
  });

  it("prefers 'author' over 'admin' for an account that authored a comment before being promoted", () => {
    const promoted = { id: AUTHOR.id, role: "admin" as const };
    expect(getCommentActor(promoted, comment, POST_OWNER.id)).toBe("author");
  });
});

describe("canComment", () => {
  it("is true for a 'user'-role viewer", () => {
    expect(canComment(AUTHOR)).toBe(true);
  });

  it("is false for an admin", () => {
    expect(canComment(ADMIN)).toBe(false);
  });

  it("is false when logged out", () => {
    expect(canComment(null)).toBe(false);
  });
});
