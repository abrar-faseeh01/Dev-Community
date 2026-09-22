// The two numbers that define what a comment may be. They live here rather
// than inline because each one is enforced in two places that must agree:
// the body length in the schema and in CreateCommentDto, the depth in the
// tree builder and in the Swagger description.

export const MAX_COMMENT_BODY_LENGTH = 2000;

// How many levels the RETURNED tree ever nests, not how many times people
// may reply to each other. A comment at this depth or shallower still nests
// under its own real parent; anything deeper attaches, in the response,
// directly under its depth-1 root instead — a flat, chronologically ordered
// list of every further reply in the thread. Replies are never rejected for
// depth: this bounds how the conversation displays, not how long it can run.
export const MAX_COMMENT_DEPTH = 2;
