import type { Post } from "@/features/posts/types/post";
import type { ReactNode } from "react";
import { PostByline } from "./post-byline";

type PostDetailProps = {
  post: Post;
  // Whether the author's name links to their profile (see PostByline).
  linkAuthor?: boolean;
  // Sits at the right of the title row — the Edit link for whoever may edit.
  headerAction?: ReactNode;
  // Below the body — the Delete button for whoever may delete, and later
  // Days 10-12's comments and reactions, without restructuring the page.
  footer?: ReactNode;
};

// A single post, read in full. The title, body, and author are user-supplied
// and rendered as plain React text — never as HTML — so markup in a post
// shows up as literal characters instead of being interpreted. The body keeps
// its line breaks and indentation (`whitespace-pre-wrap`), and `wrap-anywhere`
// stops a long unbroken string from pushing the page wider than the screen.
export function PostDetail({
  post,
  linkAuthor = false,
  headerAction,
  footer,
}: PostDetailProps) {
  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <h1 className="min-w-0 text-2xl font-bold tracking-tight text-foreground wrap-anywhere">
          {post.title}
        </h1>
        {headerAction && (
          <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5 sm:flex-row sm:items-center sm:gap-2">
            {headerAction}
          </div>
        )}
      </div>

      <PostByline post={post} linkAuthor={linkAuthor} />

      <div className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-foreground wrap-anywhere">
        {post.body}
      </div>

      {footer && (
        <div className="mt-6 border-t border-border pt-4">{footer}</div>
      )}
    </article>
  );
}
