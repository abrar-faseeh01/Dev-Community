import { Avatar } from "@/components/common/avatar";
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
  // Post Detail turns this on; the feed card and "Posts made by you" leave
  // it off — the feed's own restyle pass explicitly left avatars out, so
  // this stays opt-in rather than changing what either of those already
  // render. One component either way, not a fork.
  showAvatar?: boolean;
};

// "Author · 3h ago", with the author's headline on its own line beneath.
// Shared by the feed card and the post page so the two can't drift apart.
// The headline is on its own line, not inline after the name: a long
// headline that wraps beside "name · time" leaves a dangling "·" at the end
// of the first line on a narrow screen.
export function PostByline({ post, linkAuthor = false, showAvatar = false }: PostBylineProps) {
  const { author } = post;

  const nameAndTime = (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-neutral-400">
      {linkAuthor && author.id ? (
        <Link
          href={ROUTES.profile(author.id)}
          className="font-medium text-white hover:text-emerald-400 hover:underline"
        >
          {author.fullName}
        </Link>
      ) : (
        <span className="font-medium text-white">{author.fullName}</span>
      )}
      <span aria-hidden="true">·</span>
      <time
        dateTime={post.createdAt}
        title={formatFullDateTime(post.createdAt)}
      >
        {formatRelativeTime(post.createdAt)}
      </time>
    </p>
  );

  const headlineLine = author.headline && (
    <p className="text-sm text-neutral-400 wrap-anywhere">
      {author.headline}
    </p>
  );

  if (!showAvatar) {
    return (
      <>
        {nameAndTime}
        {headlineLine}
      </>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <Avatar name={author.fullName} size="md" />
      <div className="min-w-0 flex-1">
        {nameAndTime}
        {headlineLine}
      </div>
    </div>
  );
}
