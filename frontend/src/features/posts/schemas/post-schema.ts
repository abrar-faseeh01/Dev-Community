import { z } from "zod";

// Mirrors backend/src/posts/dto/create-post.dto.ts and update-post.dto.ts:
// title and body are required, non-empty, and capped at 200 / 20000.
// Validated on the trimmed value, which is never longer than the raw one —
// so anything that passes here also passes the DTO's @MaxLength, and a
// whitespace-only value is rejected here rather than relying on the server.
export const POST_TITLE_MAX = 200;
export const POST_BODY_MAX = 20000;

// `reason` lives on the same schema (as it does on profile-details.ts) and
// always defaults to "" — it is only rendered, and only sent, when an admin
// is moderating someone else's post.
export const postFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(POST_TITLE_MAX, `Title must be ${POST_TITLE_MAX} characters or fewer`),
  body: z
    .string()
    .trim()
    .min(1, "Body is required")
    .max(POST_BODY_MAX, `Body must be ${POST_BODY_MAX} characters or fewer`),
  reason: z.string(),
});
export type PostFormValues = z.infer<typeof postFormSchema>;
