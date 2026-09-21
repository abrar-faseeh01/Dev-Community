import type { Post } from "@/lib/types/post";
import Link from "next/link";
import type { ReactNode } from "react";
import { PostByline } from "./post-byline";

type PostCardProps = {
  post: Post;
  // Whether the author's name links to their profile (see PostByline).
  linkAuthor?: boolean;
  // Room for Days 10-12 to add comment/reaction controls without
  // restructuring the card.
  footer?: ReactNode;
};

// One post in a list. Everything user-supplied (title, body, author name) is
// rendered as plain React text — never as HTML — and `wrap-anywhere`
// keeps a long unbroken string (a URL, a 200-character title) from pushing the
// card wider than the screen. The body is a clamped preview, not the full
// text: the list endpoint returns the whole body, and the detail page is
// where it's read in full.
export function PostCard({ post, linkAuthor = false, footer }: PostCardProps) {
  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight text-foreground wrap-anywhere">
        <Link
          href={`/posts/${post.id}`}
          className="rounded hover:text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {post.title}
        </Link>
      </h2>

      <PostByline post={post} linkAuthor={linkAuthor} />

      <p className="mt-3 line-clamp-3 text-sm text-foreground wrap-anywhere">
        {post.body}
      </p>

      {footer && (
        <div className="mt-4 border-t border-border pt-3">{footer}</div>
      )}
    </article>
  );
}
