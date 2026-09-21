// What an edit actually changes. The form's values are already trimmed (see
// features/posts/schemas/post-schema.ts) and the server stores title/body trimmed, so a plain
// comparison is enough. Only the fields that differ are sent, which keeps a
// PATCH from overwriting a field someone else just changed and stops an
// admin's title-only edit from reading as a body edit in the audit log.
export type PostChanges = { title?: string; body?: string };

export function getPostChanges(
  original: { title: string; body: string },
  next: { title: string; body: string },
): PostChanges {
  const changes: PostChanges = {};
  if (next.title.trim() !== original.title.trim()) changes.title = next.title.trim();
  if (next.body.trim() !== original.body.trim()) changes.body = next.body.trim();
  return changes;
}

export function hasPostChanges(changes: PostChanges): boolean {
  return changes.title !== undefined || changes.body !== undefined;
}
