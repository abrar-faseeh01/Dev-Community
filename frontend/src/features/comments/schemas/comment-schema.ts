import { z } from "zod";

// Mirrors backend/src/comments/dto/create-comment.dto.ts and
// update-comment.dto.ts: body is required, non-empty, and capped at 2000
// (MAX_COMMENT_BODY_LENGTH in backend/src/comments/comment.constants.ts).
// Validated on the trimmed value, which is never longer than the raw one —
// so anything that passes here also passes the DTO's @MaxLength, and a
// whitespace-only value is rejected here rather than relying on the server.
export const COMMENT_BODY_MAX = 2000;

export const commentFormSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment can't be empty")
    .max(COMMENT_BODY_MAX, `Comment must be ${COMMENT_BODY_MAX} characters or fewer`),
});
export type CommentFormValues = z.infer<typeof commentFormSchema>;
