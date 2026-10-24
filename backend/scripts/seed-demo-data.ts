import * as bcrypt from 'bcrypt';
import mongoose, { Model, Types } from 'mongoose';
import { Comment, CommentSchema } from '../src/comments/schemas/comment.schema';
import { Post, PostSchema } from '../src/posts/schemas/post.schema';
import {
  Reaction,
  ReactionSchema,
} from '../src/reactions/schemas/reaction.schema';
import { User, UserSchema } from '../src/users/schemas/user.schema';

const ALLOWED_DATABASES = ['devcommunity-seed-test'] as const;
const ALLOWED_LOCAL_HOSTS = ['localhost', '127.0.0.1'] as const;
const BCRYPT_SALT_ROUNDS = 12;

const id = (value: string) => new Types.ObjectId(value);

const users = [
  {
    id: id('66f000000000000000000001'),
    fullName: 'Alex Morgan',
    email: 'alex.fullstack.demo@example.com',
    passwordEnv: 'DEMO_FULLSTACK_PASSWORD',
    headline: 'Full-Stack Software Engineer | TypeScript, React, NestJS',
    bio: 'Demo profile. Interested in maintainable full-stack systems, practical API design, and the small decisions that make software easier to change.',
    skills: [
      'TypeScript',
      'React',
      'Next.js',
      'Node.js',
      'NestJS',
      'MongoDB',
      'PostgreSQL',
      'Testing',
      'System Design',
    ],
  },
  {
    id: id('66f000000000000000000002'),
    fullName: 'Mina Patel',
    email: 'mina.ai.demo@example.com',
    passwordEnv: 'DEMO_AI_PASSWORD',
    headline: 'AI Engineer | LLM Applications, RAG, Evaluation',
    bio: 'Demo profile. Focused on dependable LLM applications: retrieval quality, tool boundaries, evaluation, and making model behavior observable.',
    skills: [
      'Python',
      'LLMs',
      'RAG',
      'Embeddings',
      'Vector Search',
      'Evaluation',
      'Prompt Engineering',
      'AI Agents',
    ],
  },
  {
    id: id('66f000000000000000000003'),
    fullName: 'Jordan Lee',
    email: 'jordan.platform.demo@example.com',
    passwordEnv: 'DEMO_BACKEND_PASSWORD',
    headline: 'Backend & Platform Engineer | APIs, Data, Reliability',
    bio: 'Demo profile. Interested in API performance, databases, deployment workflows, and building systems that are straightforward to operate.',
    skills: [
      'Node.js',
      'Backend Architecture',
      'MongoDB',
      'Redis',
      'Docker',
      'Kubernetes',
      'CI/CD',
      'Observability',
      'Cloud',
    ],
  },
] as const;

const postDrafts = [
  {
    id: id('66f000000000000000000101'),
    authorId: users[0].id,
    createdDaysAgo: 18,
    title: 'Keep API boundaries boring, especially when the UI is moving fast',
    body: `When a screen needs a slightly different shape of data, it is tempting to add a one-off endpoint that returns whatever the component wants today. That often feels fast until two screens need the same concept with different fields.

I prefer keeping resource routes consistent and doing presentation-specific composition in a query hook or a small backend read model when the query itself is genuinely different. The boundary should make ownership clear: services talk HTTP, feature code understands the data, and components focus on interaction.

The useful test is whether the API shape still makes sense without the current page. If it does, it is probably a good resource contract. If not, document why the specialized endpoint exists and keep its scope narrow.`,
  },
  {
    id: id('66f000000000000000000102'),
    authorId: users[0].id,
    createdDaysAgo: 15,
    title: 'A quick React performance check before reaching for memoization',
    body: 'If a React screen feels slow, first find out whether the cost is rendering, network latency, or a large computation. The React profiler and browser performance panel usually point to a much smaller fix than adding memoization everywhere. What profiling tools do you reach for first?',
  },
  {
    id: id('66f000000000000000000103'),
    authorId: users[1].id,
    createdDaysAgo: 12,
    title: 'A RAG pipeline is only as useful as the retrieval you can measure',
    body: `A common first version of retrieval-augmented generation is: split documents, embed the chunks, retrieve the nearest neighbors, and send them to a model. It is a reasonable prototype, but production quality depends on several steps that are easy to hide behind one similarity score.

Start with a representative evaluation set. For each question, record the relevant source passages and the expected answer or key facts. Then measure retrieval separately from generation: recall@k tells you whether the evidence was found, while answer checks tell you whether the model used it correctly. A fluent answer can still be unsupported.

Chunking is a product decision as much as a vector decision. Splitting only by a fixed character count can separate a heading from its section or break a code example away from the explanation. Prefer structure-aware boundaries where possible, retain useful metadata, and inspect retrieved examples rather than tuning embeddings from aggregate scores alone.

For a practical iteration loop:

- Establish a small, versioned evaluation set before changing the index.
- Compare chunk sizes, overlap, and metadata filters against that same set.
- Try hybrid retrieval when exact names, identifiers, or error codes matter.
- Rerank only after checking that the candidate set contains the right evidence.
- Preserve source identifiers so responses can expose citations and debugging can trace a bad result.

Also make the retrieval boundary explicit. Apply tenant, document-state, and access-control filters before passages are assembled into the model context; filtering citations after generation does not undo exposure. If documents can change, define whether the index is updated synchronously, refreshed on a schedule, or versioned so a stale passage can be traced. A source ID and revision are more useful than a text excerpt alone when someone reports a wrong answer.

Finally, test failure behavior. Empty retrieval should not quietly become a confident answer, and stale or unauthorized documents must not leak through a broad metadata filter. Put a limit on the context budget so a large result set cannot crowd out instructions or drive unpredictable latency. Track retrieval latency, source coverage, citation validity, and the no-result rate alongside model latency. Review representative misses by category: a retrieval miss, a source-quality problem, and a generation mistake need different fixes.

This process is less glamorous than changing models, but it makes the next experiment legible. When an answer regresses, the evaluation set can show whether the evidence disappeared, ranking changed, or the model stopped using evidence it still received. That is a much better starting point than treating every bad answer as a prompt problem.`,
  },
  {
    id: id('66f000000000000000000104'),
    authorId: users[1].id,
    createdDaysAgo: 9,
    title:
      'Tool calling needs the same validation discipline as any external input',
    body: `A model proposing a tool call is not the same as a trusted service deciding to execute one. Validate the tool name, parse arguments against a strict schema, enforce authorization using the signed-in user's context, and bound timeouts and retries.

I also like to separate the model-facing tool result from internal errors. Return a concise, safe failure that lets the model recover, while logging a correlation ID and structured details for operators. Retries should be limited to operations that are idempotent or protected by an idempotency key; otherwise an apparently harmless retry can repeat a side effect.

The model can help choose an action, but the application remains responsible for what that action is allowed to do.`,
  },
  {
    id: id('66f000000000000000000105'),
    authorId: users[2].id,
    createdDaysAgo: 6,
    title: 'Choosing between a request handler and a background queue',
    body: `A queue is useful when work can finish after the client receives its response, when bursts need smoothing, or when failures need retry and inspection. It is not automatically a performance upgrade: it adds delivery semantics, operational state, and another place where work can be duplicated.

I usually start by writing down the user-visible contract. Does the caller need the result now? Can the operation be safely retried? What is the acceptable delay, and how will a stuck job be noticed? If the task is short and the caller needs its result, a synchronous request with a clear timeout may be simpler.

For queued work, design the job as at-least-once unless the chosen system proves otherwise. Use an idempotency key or a unique business key at the write boundary, record attempts and terminal failures, and make job status observable. A dead-letter queue is only useful if someone can inspect and replay it safely.

Keep payloads small and versionable. Passing a document snapshot into a job can make it process stale state; passing an ID means the worker must decide whether it should read the latest state or a specific version. Make that choice explicit.

Also think about how the request becomes a job. If an API writes a database record and then publishes a message, a process crash between those two steps can leave the record committed with no work queued. A transactional outbox can close that gap: write the business change and an outbox row in one database transaction, then let a publisher deliver the message and mark the row handled. That adds a component, so it is most useful when losing the event is materially worse than the extra operational work.

Retries need policy, not just a counter. Use bounded attempts with backoff and jitter for transient failures, avoid retrying permanent validation errors, and consider a per-job timeout so a stuck worker does not hold capacity forever. If a downstream service is degraded, queue growth is a signal to apply backpressure or reject work deliberately; accepting jobs indefinitely only moves the failure into storage and increases recovery time.

Make the user-facing state match the asynchronous contract. A job ID and status endpoint can distinguish queued, running, completed, and failed work. Include a safe explanation for terminal failures and a clear rule for whether the caller may retry. In operations, watch queue age and throughput as well as queue length: a stable count can still hide jobs that have stopped progressing.

Queues are a good fit for email delivery, media processing, scheduled reports, and other work where eventual completion is acceptable. They are a poor fit when they merely hide a slow request without a plan for backpressure, retries, and user feedback. The operational cost is part of the architecture trade-off.`,
  },
  {
    id: id('66f000000000000000000106'),
    authorId: users[2].id,
    createdDaysAgo: 4,
    title:
      'Container debugging tip: compare the runtime environment, not just the image',
    body: 'When a container works locally but fails after deployment, compare the command, working directory, injected environment variables, network access, and mounted files before rebuilding the image. The image can be identical while the runtime contract is not. Which deployment detail has caught you out recently?',
  },
] as const;

const comments = [
  {
    id: id('66f000000000000000000201'),
    postId: postDrafts[0].id,
    authorId: users[1].id,
    hoursAfterPost: 5,
    body: 'How do you decide when a read model is justified instead of composing the response in the query layer?',
  },
  {
    id: id('66f000000000000000000202'),
    postId: postDrafts[0].id,
    authorId: users[2].id,
    hoursAfterPost: 32,
    body: 'I would add one more check: version the contract when clients deploy independently, so a backend cleanup does not surprise an older frontend.',
  },
  {
    id: id('66f000000000000000000203'),
    postId: postDrafts[1].id,
    authorId: users[2].id,
    hoursAfterPost: 13,
    body: 'I also check the network panel first. A waterfall from serial requests can look like a rendering problem at a glance.',
  },
  {
    id: id('66f000000000000000000204'),
    postId: postDrafts[2].id,
    authorId: users[0].id,
    hoursAfterPost: 41,
    body: 'The separate retrieval and answer metrics are useful. Do you keep the evaluation set fixed, or rotate some questions to catch regressions on newer content?',
  },
  {
    id: id('66f000000000000000000205'),
    postId: postDrafts[2].id,
    authorId: users[2].id,
    hoursAfterPost: 7,
    body: 'Source-level authorization needs to happen before retrieval results reach the model. Filtering citations only in the final response would be too late.',
  },
  {
    id: id('66f000000000000000000206'),
    postId: postDrafts[3].id,
    authorId: users[0].id,
    hoursAfterPost: 26,
    body: 'Idempotency is especially easy to miss when a tool call times out after the side effect succeeded. A request key gives the retry a useful boundary.',
  },
  {
    id: id('66f000000000000000000207'),
    postId: postDrafts[3].id,
    authorId: users[2].id,
    hoursAfterPost: 3,
    body: 'Would you expose the tool schema version in the trace as well? It can explain why an older conversation produced arguments that no longer validate.',
  },
  {
    id: id('66f000000000000000000208'),
    postId: postDrafts[4].id,
    authorId: users[0].id,
    hoursAfterPost: 48,
    body: 'For work that needs an immediate acknowledgment but not an immediate result, returning a job ID and status URL has been a clear contract for me.',
  },
  {
    id: id('66f000000000000000000209'),
    postId: postDrafts[5].id,
    authorId: users[0].id,
    hoursAfterPost: 19,
    body: 'Architecture and platform make a difference too: local containers often have implicit access to services that the deployed network does not.',
  },
  {
    id: id('66f000000000000000000210'),
    postId: postDrafts[5].id,
    authorId: users[1].id,
    hoursAfterPost: 11,
    body: 'For AI services I would add model endpoint reachability and request-size limits to that checklist. Both can differ between local and hosted environments.',
  },
] as const;

const reactions = [
  {
    id: id('66f000000000000000000301'),
    userId: users[1].id,
    targetId: postDrafts[0].id,
    hoursAfterPost: 4,
    type: 'like',
  },
  {
    id: id('66f000000000000000000302'),
    userId: users[2].id,
    targetId: postDrafts[0].id,
    hoursAfterPost: 17,
    type: 'like',
  },
  {
    id: id('66f000000000000000000303'),
    userId: users[1].id,
    targetId: postDrafts[1].id,
    hoursAfterPost: 38,
    type: 'like',
  },
  {
    id: id('66f000000000000000000304'),
    userId: users[2].id,
    targetId: postDrafts[1].id,
    hoursAfterPost: 22,
    type: 'like',
  },
  {
    id: id('66f000000000000000000305'),
    userId: users[0].id,
    targetId: postDrafts[2].id,
    hoursAfterPost: 64,
    type: 'like',
  },
  {
    id: id('66f000000000000000000307'),
    userId: users[2].id,
    targetId: postDrafts[2].id,
    hoursAfterPost: 28,
    type: 'like',
  },
  {
    id: id('66f000000000000000000310'),
    userId: users[2].id,
    targetId: postDrafts[3].id,
    hoursAfterPost: 11,
    type: 'like',
  },
  {
    id: id('66f000000000000000000308'),
    userId: users[0].id,
    targetId: postDrafts[3].id,
    hoursAfterPost: 15,
    type: 'like',
  },
  {
    id: id('66f000000000000000000311'),
    userId: users[0].id,
    targetId: postDrafts[4].id,
    hoursAfterPost: 53,
    type: 'like',
  },
  {
    id: id('66f000000000000000000312'),
    userId: users[1].id,
    targetId: postDrafts[4].id,
    hoursAfterPost: 36,
    type: 'like',
  },
  {
    id: id('66f000000000000000000313'),
    userId: users[0].id,
    targetId: postDrafts[5].id,
    hoursAfterPost: 8,
    type: 'like',
  },
  {
    id: id('66f000000000000000000314'),
    userId: users[1].id,
    targetId: postDrafts[5].id,
    hoursAfterPost: 45,
    type: 'like',
  },
] as const;

type SeedCollection = 'users' | 'posts' | 'comments' | 'reactions';
type SeedReport = Record<
  SeedCollection,
  { created: string[]; skipped: string[] }
>;
type MongoIndex = {
  key: Record<string, unknown>;
  unique?: boolean;
};

function newReport(): SeedReport {
  return {
    users: { created: [], skipped: [] },
    posts: { created: [], skipped: [] },
    comments: { created: [], skipped: [] },
    reactions: { created: [], skipped: [] },
  };
}

function assertDatabaseUri(uri: string): (typeof ALLOWED_DATABASES)[number] {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('MONGODB_URI is not a valid MongoDB connection URI.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (
    parsed.protocol !== 'mongodb:' ||
    !ALLOWED_LOCAL_HOSTS.includes(
      parsed.hostname as (typeof ALLOWED_LOCAL_HOSTS)[number],
    ) ||
    !ALLOWED_DATABASES.includes(
      databaseName as (typeof ALLOWED_DATABASES)[number],
    ) ||
    (parsed.searchParams.has('dbName') &&
      parsed.searchParams.get('dbName') !== databaseName)
  ) {
    throw new Error(
      `MONGODB_URI must target ${ALLOWED_DATABASES[0]} on localhost or 127.0.0.1.`,
    );
  }
  return databaseName as (typeof ALLOWED_DATABASES)[number];
}

function timestampDaysAgo(now: Date, daysAgo: number): Date {
  return new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
}

function timestampHoursAfter(date: Date, hoursAfter: number): Date {
  return new Date(date.getTime() + hoursAfter * 60 * 60 * 1000);
}

async function validateSeedDocument<T extends mongoose.Document>(
  DocumentModel: Model<T>,
  document: object,
  documentId: string,
): Promise<T> {
  const instance = new DocumentModel(document);
  try {
    await instance.validate();
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      const fields = Object.keys(error.errors);
      throw new Error(
        `Demo document ${documentId} validation failed for fields: ${fields.join(', ') || '(unknown)'}.`,
      );
    }
    throw error;
  }
  return instance;
}

function safeErrorKind(error: unknown): string {
  if (error instanceof mongoose.Error.ValidationError) {
    return 'Mongoose validation failed';
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (typeof error.code === 'number' || typeof error.code === 'string')
  ) {
    return `database error code ${error.code}`;
  }
  return error instanceof Error ? error.name : 'unknown error';
}

function hasUniqueIndex(
  indexes: readonly MongoIndex[],
  fields: readonly string[],
): boolean {
  return indexes.some(({ key, unique }) => {
    const indexedFields = Object.keys(key);
    return (
      unique === true &&
      indexedFields.length === fields.length &&
      fields.every(
        (field, index) => indexedFields[index] === field && key[field] === 1,
      )
    );
  });
}

async function readRequiredIndexState(
  UserModel: Model<User>,
  ReactionModel: Model<Reaction>,
): Promise<{ userEmail: boolean; reactionTarget: boolean }> {
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error('MongoDB connection is not ready to inspect indexes.');
  }

  const collections = await database
    .listCollections({}, { nameOnly: true })
    .toArray();
  const hasCollection = (name: string) =>
    collections.some((collection) => collection.name === name);
  const userCollectionExists = hasCollection(
    UserModel.collection.collectionName,
  );
  const reactionCollectionExists = hasCollection(
    ReactionModel.collection.collectionName,
  );
  const [userIndexes, reactionIndexes] = await Promise.all([
    userCollectionExists ? UserModel.collection.indexes() : Promise.resolve([]),
    reactionCollectionExists
      ? ReactionModel.collection.indexes()
      : Promise.resolve([]),
  ]);

  return {
    userEmail: hasUniqueIndex(userIndexes, ['email']),
    reactionTarget: hasUniqueIndex(reactionIndexes, [
      'userId',
      'targetType',
      'targetId',
    ]),
  };
}

async function prepareRequiredIndexes(
  UserModel: Model<User>,
  ReactionModel: Model<Reaction>,
  dryRun: boolean,
): Promise<void> {
  let indexState = await readRequiredIndexState(UserModel, ReactionModel);
  if (dryRun) {
    if (!indexState.userEmail || !indexState.reactionTarget) {
      console.warn(
        'Dry run: required unique indexes are absent; a real seed run will create and verify them after document validation.',
      );
    }
    return;
  }

  await Promise.all([UserModel.createIndexes(), ReactionModel.createIndexes()]);
  indexState = await readRequiredIndexState(UserModel, ReactionModel);
  if (!indexState.userEmail) {
    throw new Error(
      'The target database is missing the unique users.email index.',
    );
  }
  if (!indexState.reactionTarget) {
    throw new Error(
      'The target database is missing the unique reaction target index.',
    );
  }
}

function requirePassword(user: (typeof users)[number]): string {
  const password = process.env[user.passwordEnv];
  if (!password || password.length < 8) {
    throw new Error(
      `${user.passwordEnv} must be set to a password of at least 8 characters for a new demo account.`,
    );
  }
  return password;
}

async function preflight(
  UserModel: Model<User>,
  PostModel: Model<Post>,
  CommentModel: Model<Comment>,
  ReactionModel: Model<Reaction>,
  report: SeedReport,
): Promise<{
  existingUsers: Set<string>;
  existingPosts: Set<string>;
  existingComments: Set<string>;
  existingReactions: Set<string>;
}> {
  const existingUsers = new Set<string>();
  const existingPosts = new Set<string>();
  const existingComments = new Set<string>();
  const existingReactions = new Set<string>();

  for (const user of users) {
    const [byId, byEmail] = await Promise.all([
      UserModel.findById(user.id).select('_id email role').lean().exec(),
      UserModel.findOne({ email: user.email })
        .select('_id email role')
        .lean()
        .exec(),
    ]);
    if (
      (byId && (byId.email !== user.email || byId.role !== 'user')) ||
      (byEmail && String(byEmail._id) !== String(user.id)) ||
      (byId && byEmail && String(byId._id) !== String(byEmail._id))
    ) {
      throw new Error(
        `Identity collision for demo account ${user.email}; no records were written.`,
      );
    }
    if (byId) {
      existingUsers.add(String(user.id));
      report.users.skipped.push(user.email);
    }
  }

  for (const post of postDrafts) {
    const [byId, sameContent] = await Promise.all([
      PostModel.findById(post.id)
        .select('_id authorId title body deletedAt')
        .lean()
        .exec(),
      PostModel.findOne({
        authorId: post.authorId,
        title: post.title,
        body: post.body,
      })
        .select('_id')
        .lean()
        .exec(),
    ]);
    if (byId?.deletedAt !== null && byId?.deletedAt !== undefined) {
      throw new Error(
        `Expected demo post ${post.id} is soft-deleted; refusing to modify it.`,
      );
    }
    if (
      (byId &&
        (String(byId.authorId) !== String(post.authorId) ||
          byId.title !== post.title ||
          byId.body !== post.body)) ||
      (sameContent && String(sameContent._id) !== String(post.id))
    ) {
      throw new Error(
        `Post identity collision for ${post.id}; no records were written.`,
      );
    }
    if (byId) {
      existingPosts.add(String(post.id));
      report.posts.skipped.push(String(post.id));
    }
  }

  for (const comment of comments) {
    const [byId, sameContent] = await Promise.all([
      CommentModel.findById(comment.id)
        .select('_id postId authorId parentCommentId body deletedAt')
        .lean()
        .exec(),
      CommentModel.findOne({
        postId: comment.postId,
        authorId: comment.authorId,
        parentCommentId: null,
        body: comment.body,
      })
        .select('_id')
        .lean()
        .exec(),
    ]);
    if (byId?.deletedAt !== null && byId?.deletedAt !== undefined) {
      throw new Error(
        `Expected demo comment ${comment.id} is soft-deleted; refusing to modify it.`,
      );
    }
    if (
      (byId &&
        (String(byId.postId) !== String(comment.postId) ||
          String(byId.authorId) !== String(comment.authorId) ||
          byId.parentCommentId !== null ||
          byId.body !== comment.body)) ||
      (sameContent && String(sameContent._id) !== String(comment.id))
    ) {
      throw new Error(
        `Comment identity collision for ${comment.id}; no records were written.`,
      );
    }
    if (byId) {
      existingComments.add(String(comment.id));
      report.comments.skipped.push(String(comment.id));
    }
  }

  for (const reaction of reactions) {
    const [byId, sameTarget] = await Promise.all([
      ReactionModel.findById(reaction.id)
        .select('_id userId targetType targetId type')
        .lean()
        .exec(),
      ReactionModel.findOne({
        userId: reaction.userId,
        targetType: 'post',
        targetId: reaction.targetId,
      })
        .select('_id')
        .lean()
        .exec(),
    ]);
    if (
      (byId &&
        (String(byId.userId) !== String(reaction.userId) ||
          byId.targetType !== 'post' ||
          String(byId.targetId) !== String(reaction.targetId) ||
          byId.type !== reaction.type)) ||
      (sameTarget && String(sameTarget._id) !== String(reaction.id))
    ) {
      throw new Error(
        `Reaction identity collision for ${reaction.id}; no records were written.`,
      );
    }
    if (byId) {
      existingReactions.add(String(reaction.id));
      report.reactions.skipped.push(String(reaction.id));
    }
  }

  return { existingUsers, existingPosts, existingComments, existingReactions };
}

async function main(): Promise<void> {
  const report = newReport();
  const dryRun = process.argv.includes('--dry-run');
  try {
    if (process.env.ALLOW_DEMO_SEED !== 'true') {
      throw new Error('Refusing to run without ALLOW_DEMO_SEED=true.');
    }
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error(
        'MONGODB_URI must be set in the current process environment.',
      );
    }
    const uriDatabase = assertDatabaseUri(uri);

    await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
    if (
      !ALLOWED_DATABASES.includes(
        mongoose.connection.name as (typeof ALLOWED_DATABASES)[number],
      ) ||
      mongoose.connection.name !== uriDatabase
    ) {
      throw new Error(
        'Connected database does not match the allowlisted database in MONGODB_URI; no records were written.',
      );
    }
    console.log(`Verified target database: ${mongoose.connection.name}`);

    const UserModel = mongoose.model(User.name, UserSchema);
    const PostModel = mongoose.model(Post.name, PostSchema);
    const CommentModel = mongoose.model(Comment.name, CommentSchema);
    const ReactionModel = mongoose.model(Reaction.name, ReactionSchema);

    const state = await preflight(
      UserModel,
      PostModel,
      CommentModel,
      ReactionModel,
      report,
    );

    const userDocuments: User[] = [];
    for (const user of users) {
      if (state.existingUsers.has(String(user.id))) continue;
      const passwordHash = dryRun
        ? 'dry-run-validation-placeholder'
        : await bcrypt.hash(requirePassword(user), BCRYPT_SALT_ROUNDS);
      userDocuments.push(
        await validateSeedDocument(
          UserModel,
          {
            _id: user.id,
            fullName: user.fullName,
            email: user.email,
            passwordHash,
            role: 'user',
            headline: user.headline,
            bio: user.bio,
            skills: [...user.skills],
          },
          String(user.id),
        ),
      );
    }

    const now = new Date();
    const postCreatedAt = new Map<string, Date>();
    const postDocuments: Post[] = [];
    for (const post of postDrafts) {
      const createdAt = timestampDaysAgo(now, post.createdDaysAgo);
      postCreatedAt.set(String(post.id), createdAt);
      if (state.existingPosts.has(String(post.id))) continue;
      const postComments = comments.filter(
        (comment) => String(comment.postId) === String(post.id),
      );
      const postReactions = reactions.filter(
        (reaction) => String(reaction.targetId) === String(post.id),
      );
      postDocuments.push(
        await validateSeedDocument(
          PostModel,
          {
            _id: post.id,
            authorId: post.authorId,
            title: post.title,
            body: post.body,
            createdAt,
            updatedAt: createdAt,
            likeCount: postReactions.length,
            dislikeCount: 0,
            commentCount: postComments.length,
            deletedAt: null,
          },
          String(post.id),
        ),
      );
    }

    const commentDocuments: Comment[] = [];
    for (const comment of comments) {
      if (state.existingComments.has(String(comment.id))) continue;
      const createdAt = timestampHoursAfter(
        postCreatedAt.get(String(comment.postId))!,
        comment.hoursAfterPost,
      );
      commentDocuments.push(
        await validateSeedDocument(
          CommentModel,
          {
            _id: comment.id,
            postId: comment.postId,
            authorId: comment.authorId,
            parentCommentId: null,
            ancestorIds: [],
            body: comment.body,
            createdAt,
            updatedAt: createdAt,
          },
          String(comment.id),
        ),
      );
    }

    const reactionDocuments: Reaction[] = [];
    for (const reaction of reactions) {
      if (state.existingReactions.has(String(reaction.id))) continue;
      const createdAt = timestampHoursAfter(
        postCreatedAt.get(String(reaction.targetId))!,
        reaction.hoursAfterPost,
      );
      reactionDocuments.push(
        await validateSeedDocument(
          ReactionModel,
          {
            _id: reaction.id,
            userId: reaction.userId,
            targetType: 'post',
            targetId: reaction.targetId,
            type: reaction.type,
            createdAt,
            updatedAt: createdAt,
          },
          String(reaction.id),
        ),
      );
    }

    await prepareRequiredIndexes(UserModel, ReactionModel, dryRun);

    if (dryRun) {
      console.log('Dry run: no database writes will be performed.');
      console.log(
        'Would create:',
        JSON.stringify(
          {
            users: userDocuments.map((document) => String(document._id)),
            posts: postDocuments.map((document) => String(document._id)),
            comments: commentDocuments.map((document) => String(document._id)),
            reactions: reactionDocuments.map((document) =>
              String(document._id),
            ),
          },
          null,
          2,
        ),
      );
      console.log(
        'Would skip existing records:',
        JSON.stringify(report, null, 2),
      );
    } else {
      for (const document of userDocuments) {
        try {
          await document.save();
          report.users.created.push(String(document.email));
        } catch (error) {
          throw new Error(
            `Could not create demo account ${String(document._id)} (${safeErrorKind(error)}).`,
          );
        }
      }
      for (const document of postDocuments) {
        try {
          await document.save({ timestamps: false });
          report.posts.created.push(String(document._id));
        } catch (error) {
          throw new Error(
            `Could not create demo post ${String(document._id)} (${safeErrorKind(error)}).`,
          );
        }
      }
      for (const document of commentDocuments) {
        try {
          await document.save({ timestamps: false });
          report.comments.created.push(String(document._id));
        } catch (error) {
          throw new Error(
            `Could not create demo comment ${String(document._id)} (${safeErrorKind(error)}).`,
          );
        }
      }
      for (const document of reactionDocuments) {
        try {
          await document.save({ timestamps: false });
          report.reactions.created.push(String(document._id));
        } catch (error) {
          throw new Error(
            `Could not create demo reaction ${String(document._id)} (${safeErrorKind(error)}).`,
          );
        }
      }
    }

    for (const post of postDrafts) {
      const postId = String(post.id);
      const [likeCount, dislikeCount, commentCount] = await Promise.all([
        ReactionModel.countDocuments({
          targetType: 'post',
          targetId: post.id,
          type: 'like',
        }),
        ReactionModel.countDocuments({
          targetType: 'post',
          targetId: post.id,
          type: 'dislike',
        }),
        CommentModel.countDocuments({ postId: post.id, deletedAt: null }),
      ]);
      const storedPost = await PostModel.findById(post.id)
        .select('likeCount dislikeCount commentCount')
        .lean()
        .exec();
      if (
        storedPost &&
        (storedPost.likeCount !== likeCount ||
          storedPost.dislikeCount !== dislikeCount ||
          storedPost.commentCount !== commentCount)
      ) {
        console.warn(
          `Counter mismatch for demo post ${postId}: stored (${storedPost.likeCount ?? 0}/${storedPost.dislikeCount ?? 0}/${storedPost.commentCount ?? 0}), actual (${likeCount}/${dislikeCount}/${commentCount}). No counters were changed.`,
        );
      }
    }

    console.log(
      dryRun ? 'Demo data dry-run completed.' : 'Demo data seeding completed.',
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Demo data seeding failed.',
    );
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch {
        console.error('Could not cleanly close the MongoDB connection.');
        process.exitCode = 1;
      }
    }
    console.log('Seed report:', JSON.stringify(report, null, 2));
  }
}

void main();
