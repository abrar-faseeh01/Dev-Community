// The author summary as every content route returns it (posts, comments) —
// mirrors backend/src/users/author-summary.ts's AuthorSummary exactly. A
// deleted account gets id: null and fullName: "Deleted user" instead of a
// missing author, so nothing downstream needs a null check to render a row.
export type AuthorSummary = {
  id: string | null;
  fullName: string;
  headline?: string | null;
};
