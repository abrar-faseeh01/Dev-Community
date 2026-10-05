import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { Comment, CommentSchema } from '../src/comments/schemas/comment.schema';
import { Post, PostSchema } from '../src/posts/schemas/post.schema';
import {
  Reaction,
  ReactionSchema,
} from '../src/reactions/schemas/reaction.schema';
import { User, UserSchema } from '../src/users/schemas/user.schema';

// Throwaway data for testing the Day 19 post-purge job.
//
//   npm run seed:purge -- seed [expiredCount]   (default 10, max 500)
//   npm run seed:purge -- status
//   npm run seed:purge -- clean
//
// Everything created here hangs off three marker accounts
// (purge-seed-*@devcommunity.local), and `clean` removes rows only through
// those accounts' ids, never by a broad filter. `seed` runs `clean` first, so
// it is safe to run twice.

const TITLE_PREFIX = '[purge-seed]';
const TITLE_REGEX = /^\[purge-seed\]/;
const EMAIL_PATTERN = /^purge-seed-[a-z-]+@devcommunity\.local$/;
const MAX_SEED_USERS = 10; // more matches than this means the pattern is wrong
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

function getModels() {
  return {
    user: mongoose.model(User.name, UserSchema),
    post: mongoose.model(Post.name, PostSchema),
    comment: mongoose.model(Comment.name, CommentSchema),
    reaction: mongoose.model(Reaction.name, ReactionSchema),
  };
}
type Models = ReturnType<typeof getModels>;

async function findSeedUsers(m: Models) {
  const users = await m.user
    .find({ email: EMAIL_PATTERN })
    .select('_id email')
    .lean();
  if (users.length > MAX_SEED_USERS) {
    throw new Error(
      `Matched ${users.length} seed users (limit ${MAX_SEED_USERS}); refusing to continue.`,
    );
  }
  return users;
}

async function clean(m: Models) {
  const users = await findSeedUsers(m);
  if (users.length === 0) {
    console.log('No purge-seed data found. Nothing to clean.');
    return;
  }
  const userIds = users.map((u) => u._id);

  const posts = await m.post
    .find({ authorId: { $in: userIds }, title: TITLE_REGEX })
    .select('_id')
    .lean();
  const postIds = posts.map((p) => p._id);

  const comments = await m.comment
    .find({
      $or: [{ authorId: { $in: userIds } }, { postId: { $in: postIds } }],
    })
    .select('_id')
    .lean();
  const commentIds = comments.map((c) => c._id);

  const reactions = await m.reaction.deleteMany({
    $or: [
      { userId: { $in: userIds } },
      { targetType: 'post', targetId: { $in: postIds } },
      { targetType: 'comment', targetId: { $in: commentIds } },
    ],
  });
  const deletedComments = await m.comment.deleteMany({
    _id: { $in: commentIds },
  });
  const deletedPosts = await m.post.deleteMany({ _id: { $in: postIds } });
  const deletedUsers = await m.user.deleteMany({
    _id: { $in: userIds },
    email: EMAIL_PATTERN,
  });

  console.log(
    `Cleaned: ${deletedPosts.deletedCount} posts, ${deletedComments.deletedCount} comments, ` +
      `${reactions.deletedCount} reactions, ${deletedUsers.deletedCount} users.`,
  );
}

async function status(m: Models) {
  const users = await findSeedUsers(m);
  const userIds = users.map((u) => u._id);

  const posts = await m.post
    .find({ authorId: { $in: userIds } })
    .select('title deletedAt')
    .sort({ _id: 1 })
    .lean();
  const comments = await m.comment
    .find({ authorId: { $in: userIds } })
    .select('postId')
    .lean();
  const reactions = await m.reaction
    .find({ userId: { $in: userIds } })
    .select('targetType targetId')
    .lean();

  const postSet = new Set(posts.map((p) => String(p._id)));
  const commentToPost = new Map(
    comments.map((c) => [String(c._id), String(c.postId)]),
  );

  const commentsPerPost = new Map<string, number>();
  for (const postId of commentToPost.values()) {
    commentsPerPost.set(postId, (commentsPerPost.get(postId) ?? 0) + 1);
  }
  const reactionsPerPost = new Map<string, number>();
  let orphanReactions = 0;
  for (const r of reactions) {
    const target = String(r.targetId);
    const postId = r.targetType === 'post' ? target : commentToPost.get(target);
    if (!postId || !postSet.has(postId)) {
      orphanReactions++;
      continue;
    }
    reactionsPerPost.set(postId, (reactionsPerPost.get(postId) ?? 0) + 1);
  }
  const orphanComments = [...commentToPost.values()].filter(
    (postId) => !postSet.has(postId),
  ).length;

  const now = Date.now();
  console.log(`Seed posts (${posts.length}):`);
  for (const p of posts) {
    const id = String(p._id);
    const age = p.deletedAt
      ? `deleted ${((now - p.deletedAt.getTime()) / DAY_MS).toFixed(1)}d ago`
      : 'live';
    console.log(
      `  ${id}  ${age.padEnd(22)} comments=${commentsPerPost.get(id) ?? 0} ` +
        `reactions=${reactionsPerPost.get(id) ?? 0}  ${p.title}`,
    );
  }
  console.log(
    `Totals: ${posts.length} posts, ${comments.length} comments, ${reactions.length} reactions`,
  );
  console.log(
    `Orphans (should always be 0): ${orphanComments} comments, ${orphanReactions} reactions`,
  );
}

async function seed(m: Models, expiredCount: number) {
  await clean(m);

  const makeUser = (slug: string, fullName: string) =>
    m.user.create({
      fullName,
      email: `purge-seed-${slug}@devcommunity.local`,
      // Random bytes, not a bcrypt hash: nobody can log in as these accounts.
      passwordHash: randomBytes(32).toString('hex'),
      role: 'user',
    });
  const author = await makeUser('author', 'Purge Seed Author');
  const reactorA = await makeUser('reactor-a', 'Purge Seed Reactor A');
  const reactorB = await makeUser('reactor-b', 'Purge Seed Reactor B');

  type Doc = Record<string, unknown>;
  const postDocs: Doc[] = [];
  const commentDocs: Doc[] = [];
  const reactionDocs: Doc[] = [];

  // One post, its comments (each with its own deletedAt), and its reactions:
  // one per entry in postReactors on the post, plus one on the first comment.
  function addPost(
    title: string,
    deletedAt: Date | null,
    commentDeletedAts: (Date | null)[],
    postReactors: Types.ObjectId[],
  ) {
    const postId = new Types.ObjectId();
    const createdAt = new Date((deletedAt ?? new Date()).getTime() - DAY_MS);
    postDocs.push({
      _id: postId,
      authorId: author._id,
      title: `${TITLE_PREFIX} ${title}`,
      body: 'Throwaway post for testing the purge job.',
      deletedAt,
      createdAt,
    });

    const commentIds = commentDeletedAts.map((commentDeletedAt, i) => {
      const commentId = new Types.ObjectId();
      commentDocs.push({
        _id: commentId,
        postId,
        authorId: author._id,
        body: `Seed comment ${i + 1}`,
        deletedAt: commentDeletedAt,
        createdAt,
      });
      return commentId;
    });

    postReactors.forEach((userId, i) => {
      reactionDocs.push({
        userId,
        targetType: 'post',
        targetId: postId,
        type: i === 0 ? 'like' : 'dislike',
      });
    });
    if (commentIds.length > 0) {
      reactionDocs.push({
        userId: reactorA._id,
        targetType: 'comment',
        targetId: commentIds[0],
        type: 'like',
      });
    }
  }

  // Expired posts (8-12 days deleted). Each has the three comment shapes the
  // purge must handle: cascaded with the post, deleted individually earlier,
  // and still live (a cascade that failed). Per post: 1 post, 3 comments,
  // 3 reactions.
  for (let i = 1; i <= expiredCount; i++) {
    const deletedAt = daysAgo(8 + (i % 5));
    addPost(
      `EXPIRED #${i}`,
      deletedAt,
      [deletedAt, new Date(deletedAt.getTime() - 2 * DAY_MS), null],
      [reactorA._id, reactorB._id],
    );
  }

  // Controls: all of these must survive the purge.
  const nearlyOld = daysAgo(6.9);
  addPost('KEEP deleted 6.9 days ago', nearlyOld, [nearlyOld], [reactorA._id]);
  addPost('KEEP live post', null, [null], [reactorA._id]);
  addPost(
    'KEEP live post, comment deleted 30d ago',
    null,
    [daysAgo(30)],
    [reactorA._id],
  );

  await m.post.insertMany(postDocs);
  await m.comment.insertMany(commentDocs);
  await m.reaction.insertMany(reactionDocs);

  console.log(
    `Seeded ${postDocs.length} posts, ${commentDocs.length} comments, ${reactionDocs.length} reactions.`,
  );
  console.log(
    `After the purge runs, expect: 3 posts, 3 comments, 6 reactions, 0 orphans.`,
  );
}

async function main() {
  const [command = 'status', arg] = process.argv.slice(2);
  if (!['seed', 'status', 'clean'].includes(command)) {
    console.error('Usage: seed [expiredCount] | status | clean');
    process.exit(1);
  }
  const expiredCount = arg === undefined ? 10 : Number(arg);
  if (
    !Number.isInteger(expiredCount) ||
    expiredCount < 1 ||
    expiredCount > 500
  ) {
    console.error('expiredCount must be a whole number from 1 to 500.');
    process.exit(1);
  }
  const { MONGODB_URI } = process.env;
  if (!MONGODB_URI) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  try {
    const m = getModels();
    if (command === 'seed') await seed(m, expiredCount);
    else if (command === 'status') await status(m);
    else await clean(m);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
