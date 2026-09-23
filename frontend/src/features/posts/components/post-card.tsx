import { ROUTES } from "@/constants/routes";
import type { Post } from "@/features/posts/types/post";
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
    <article className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight text-white wrap-anywhere">
        <Link
          href={ROUTES.post(post.id)}
          className="rounded hover:text-emerald-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
        >
          {post.title}
        </Link>
      </h2>

      <PostByline post={post} linkAuthor={linkAuthor} />

      <p className="mt-3 line-clamp-3 text-sm text-neutral-300 wrap-anywhere">
        {post.body}
      </p>

      {footer && (
        <div className="mt-4 border-t border-neutral-800 pt-3">{footer}</div>
      )}
    </article>
  );
}
