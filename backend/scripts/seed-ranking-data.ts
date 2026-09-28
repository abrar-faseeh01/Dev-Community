import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import mongoose from 'mongoose';
import { Post, PostSchema } from '../src/posts/schemas/post.schema';
import { User, UserSchema } from '../src/users/schemas/user.schema';

// Controlled fixtures for Day 13's sort=top/discussed/latest verification.
// Follows seed-admin.ts's plain connect/model/log/disconnect pattern.
//
// No {timestamps: false} anywhere here, deliberately — computeRankScore
// (ranking.ts) has no time component, so createdAt is irrelevant to every
// fixture below. Plain .create() calls with real auto-timestamps are fine.
//
// Re-runnable: deletes any previously seeded ranking posts (identified by
// the title prefix) before inserting fresh ones, so running this twice
// doesn't double up fixtures.

const TITLE_PREFIX = '[ranking-seed]';

const SEED_AUTHOR_EMAIL = 'ranking-seed-author@devcommunity.local';
const SEED_EMPTY_AUTHOR_EMAIL = 'ranking-seed-empty-author@devcommunity.local';

async function seedRankingData() {
  const { MONGODB_URI } = process.env;
  if (!MONGODB_URI) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const UserModel = mongoose.model(User.name, UserSchema);
  const PostModel = mongoose.model(Post.name, PostSchema);

  const author = await getOrCreateSeedUser(
    UserModel,
    SEED_AUTHOR_EMAIL,
    'Ranking Seed Author',
  );
  // Owns zero posts on purpose — this is the empty-result fixture
  // (GET /posts?authorId=<this user>&sort=... must return { items: [],
  // nextCursor: null }, not an error).
  const emptyAuthor = await getOrCreateSeedUser(
    UserModel,
    SEED_EMPTY_AUTHOR_EMAIL,
    'Ranking Seed Empty Author',
  );

  const deleted = await PostModel.deleteMany({
    authorId: { $in: [author._id, emptyAuthor._id] },
  });
  if (deleted.deletedCount > 0) {
    console.log(
      `Removed ${deleted.deletedCount} previously seeded ranking post(s).`,
    );
  }

  const fixtures = [
    {
      title: `${TITLE_PREFIX} zero engagement`,
      body: 'No votes, no comments — every sort must place this at (or near) the bottom, not error on it.',
      likeCount: 0,
      dislikeCount: 0,
      commentCount: 0,
    },
    {
      title: `${TITLE_PREFIX} small unanimous sample (10/0)`,
      body: 'Ten likes, zero dislikes — a raw-ratio sort would rank this above the large-sample post below; Wilson must not.',
      likeCount: 10,
      dislikeCount: 0,
      commentCount: 1,
    },
    {
      title: `${TITLE_PREFIX} large mostly-approved sample (500/50)`,
      body: 'A big sample with a strong but not perfect approval ratio — must rank above the 10/0 post despite the lower raw ratio.',
      likeCount: 500,
      dislikeCount: 50,
      commentCount: 12,
    },
    {
      title: `${TITLE_PREFIX} more dislikes than likes`,
      body: 'A genuinely unpopular post — must score low, and must not produce a NaN or a crash.',
      likeCount: 5,
      dislikeCount: 20,
      commentCount: 3,
    },
    {
      title: `${TITLE_PREFIX} drifted negative like counter`,
      body: 'likeCount is stored negative here, simulating the documented $inc race in reaction-toggle.ts. Must score identically to the same post with likeCount at 0 — the parity test in posts-ranking.e2e-spec.ts asserts this by computing computeRankScore itself.',
      likeCount: -3,
      dislikeCount: 2,
      commentCount: 5,
    },
    {
      title: `${TITLE_PREFIX} tie fixture A (identical counters)`,
      body: 'Same likes/dislikes/comments as tie fixture B — the two must not tie forever; the _id tie-breaker must separate them deterministically across pages.',
      likeCount: 7,
      dislikeCount: 2,
      commentCount: 3,
    },
    {
      title: `${TITLE_PREFIX} tie fixture B (identical counters)`,
      body: 'See tie fixture A.',
      likeCount: 7,
      dislikeCount: 2,
      commentCount: 3,
    },
    {
      title: `${TITLE_PREFIX} comment-heavy, zero votes`,
      body: 'No likes or dislikes at all, but plenty of discussion — must outscore the zero-engagement post under sort=top (comments contribute independently of votes) and must lead sort=discussed outright.',
      likeCount: 0,
      dislikeCount: 0,
      commentCount: 15,
    },
  ];

  const created = await PostModel.create(
    fixtures.map((f) => ({ ...f, authorId: author._id })),
  );

  console.log(
    `Seeded ${created.length} ranking fixture post(s) for author ${author.email}:`,
  );
  for (const post of created) {
    console.log(`  ${post._id}  ${post.title}`);
  }
  console.log(
    `Empty-result fixture author (zero posts): ${emptyAuthor.email} (${emptyAuthor._id})`,
  );

  await mongoose.disconnect();
}

async function getOrCreateSeedUser(
  UserModel: mongoose.Model<User>,
  email: string,
  fullName: string,
) {
  const existing = await UserModel.findOne({ email });
  if (existing) {
    return existing;
  }
  const passwordHash = await bcrypt.hash('ranking-seed-not-a-real-login', 12);
  return UserModel.create({
    fullName,
    email,
    passwordHash,
    role: 'user',
  });
}

seedRankingData().catch((err) => {
  console.error(err);
  process.exit(1);
});
