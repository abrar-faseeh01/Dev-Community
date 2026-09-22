import { ROUTES } from "@/constants/routes";
import { formatFullDateTime, formatRelativeTime } from "@/lib/utils/format-time";
import type { Post } from "@/features/posts/types/post";
import Link from "next/link";

type PostBylineProps = {
  post: Post;
  // Whether the author's name links to their profile. /profile/[id]
  // requires a login, so callers only turn this on for signed-in viewers;
  // for an anonymous one it would just bounce to /login. A deleted author
  // (id null) has no profile, so the name is plain text either way.
  linkAuthor?: boolean;
};

// "Author · 3h ago", with the author's headline on its own line beneath.
// Shared by the feed card and the post page so the two can't drift apart.
// The headline is on its own line, not inline after the name: a long
// headline that wraps beside "name · time" leaves a dangling "·" at the end
// of the first line on a narrow screen.
export function PostByline({ post, linkAuthor = false }: PostBylineProps) {
  const { author } = post;

  return (
    <>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
        {linkAuthor && author.id ? (
          <Link
            href={ROUTES.profile(author.id)}
            className="font-medium text-foreground hover:text-accent hover:underline"
          >
            {author.fullName}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{author.fullName}</span>
        )}
        <span aria-hidden="true">·</span>
        <time
          dateTime={post.createdAt}
          title={formatFullDateTime(post.createdAt)}
        >
          {formatRelativeTime(post.createdAt)}
        </time>
      </p>
      {author.headline && (
        <p className="text-sm text-muted wrap-anywhere">
          {author.headline}
        </p>
      )}
    </>
  );
}
