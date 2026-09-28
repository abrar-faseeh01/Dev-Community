import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PipelineStage } from 'mongoose';
import {
  isValidObjectId,
  Model,
  Error as MongooseError,
  Types,
} from 'mongoose';
import { CommentsService } from '../comments/comments.service';
import type { PopulatedAuthor } from '../users/author-summary';
import { CreatePostDto } from './dto/create-post.dto';
import type { PostSort } from './dto/list-posts.dto';
import { COMMENT_WEIGHT, VOTE_WEIGHT, Z } from './ranking';
import { Post } from './schemas/post.schema';

// authorId is null when the author's account has since been deleted.
export type PostWithAuthor = Post & {
  authorId: PopulatedAuthor | null;
  // Only present on items returned by listTop's aggregation — the actual
  // score MongoDB sorted by. undefined for listLatest/listDiscussed.
  score?: number;
};

type ListResult = { items: PostWithAuthor[]; nextCursor: string | null };

// The two fields carried by a keyset cursor for a non-latest sort (Day 13).
// `sort` is embedded so a cursor from one sort can be rejected (400) when
// replayed against another, rather than silently producing garbage order.
interface KeysetCursor {
  v: number;
  id: Types.ObjectId;
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  // The dependency between posts and comments runs one way: posts asks
  // comments to clean up after it. CommentsService reads the Post model
  // directly and never imports this service, so the two modules do not
  // depend on each other.
  constructor(
    @InjectModel(Post.name) private postModel: Model<Post>,
    private readonly commentsService: CommentsService,
  ) {}

  // authorId comes from the authenticated requester only, never the DTO —
  // same principle as SignupDto never accepting a client-supplied role.
  async create(authorId: string, dto: CreatePostDto): Promise<PostWithAuthor> {
    const post = await this.postModel.create({
      authorId,
      title: dto.title,
      body: dto.body,
    });
    // Document-instance populate() (as opposed to the query-level
    // .populate<T>() in findById below) doesn't narrow the field's TS
    // type on its own, so this needs an explicit cast — the runtime
    // shape is identical either way.
    await post.populate('authorId', 'fullName headline');
    return post as unknown as PostWithAuthor;
  }

  // deletedAt: null (not { $exists: false }) — the schema's default: null
  // means every document explicitly stores deletedAt: null until soft-
  // deleted, and Mongo's null-match semantics also cover an absent field,
  // so this correctly excludes soft-deleted posts either way.
  async findById(id: string): Promise<PostWithAuthor | null> {
    const post = await this.postModel
      .findOne({ _id: id, deletedAt: null })
      .populate('authorId', 'fullName headline')
      .exec();
    // Same cast as create() above, same reason — Mongoose's populate
    // typing doesn't cleanly narrow authorId's declared ObjectId type to
    // what's actually returned at runtime.
    return post as unknown as PostWithAuthor | null;
  }

  // Deliberately unpopulated — used by the fetch-then-authorize step on
  // update/delete, where authorId must stay a raw ObjectId so
  // String(post.authorId) (per plan.md's ObjectId-vs-string trap) yields
  // the actual hex id, not a stringified populated sub-object. Same
  // deletedAt: null filter as findById, so a soft-deleted post 404s here
  // exactly like a nonexistent one, before authorization even runs.
  findRawById(id: string) {
    return this.postModel.findOne({ _id: id, deletedAt: null }).exec();
  }

  // fetch → mutate → .save(), never findByIdAndUpdate — Post's
  // optimisticConcurrency: true only guards .save() calls (confirmed back
  // in step 2/3's planning against auth.service.ts's own use of it); an
  // atomic findByIdAndUpdate would silently bypass the very race this
  // guard exists to catch. The caller already fetched `post` via
  // findRawById for authorization, so this is the same document, not an
  // extra read.
  async applyUpdate(
    post: Post,
    updates: { title?: string; body?: string },
  ): Promise<PostWithAuthor> {
    if (updates.title !== undefined) post.title = updates.title;
    if (updates.body !== undefined) post.body = updates.body;
    await this.saveOrThrowConflict(post);
    // post was fetched unpopulated (see findRawById) specifically to
    // avoid the question of whether a populated authorId path survives
    // .save() intact — it's simpler to just populate once, after save
    // succeeds, on the same saved instance.
    await post.populate('authorId', 'fullName headline');
    return post as unknown as PostWithAuthor;
  }

  // Same fetch → mutate → .save() discipline as applyUpdate — soft delete
  // is still a write to the document, and optimisticConcurrency's guard
  // only fires on .save(), never findByIdAndUpdate. Populated after save,
  // same reasoning as applyUpdate — purely so the controller can read
  // authorId.fullName for the admin-override audit call; the DELETE HTTP
  // response itself doesn't use it.
  async remove(post: Post): Promise<PostWithAuthor> {
    post.deletedAt = new Date();
    await this.saveOrThrowConflict(post);
    // Only after the post's own delete has been saved: if that save loses to
    // a concurrent edit (a 409), the post is still live and its comments
    // must be left alone.
    await this.removeCommentsOf(post);
    await post.populate('authorId', 'fullName headline');
    return post as unknown as PostWithAuthor;
  }

  // A deleted post takes its comments with it. The post's soft delete is the
  // real event and has already been saved by the time this runs, so a failure
  // here is logged and swallowed rather than turning a completed delete into
  // an error. Nothing is exposed either way: comments are only ever read
  // through their post, and a deleted post 404s, so any comment this misses is
  // hidden, not visible. It is simply left live in the collection.
  private async removeCommentsOf(post: Post): Promise<void> {
    try {
      await this.commentsService.removeAllForPost(
        post._id as Types.ObjectId,
        post.deletedAt as Date,
      );
    } catch (error) {
      this.logger.error(
        `comments of deleted post ${String(post._id)} could not be soft-deleted`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // optimisticConcurrency's guard throws a Mongoose VersionError when the
  // document changed between fetch and save (exactly the admin-edits-
  // while-author-edits race it exists to catch). VersionError isn't a
  // NestJS HttpException, so left uncaught it would fall through the
  // global filter's catch-all branch as a bare 500 — the one time this
  // guard actually does its job, the client would see an unexplained
  // crash instead of a meaningful response. 409 is the correct status for
  // a lost-update conflict.
  private async saveOrThrowConflict(post: Post): Promise<void> {
    try {
      await post.save();
    } catch (error) {
      if (error instanceof MongooseError.VersionError) {
        throw new ConflictException(
          'This post was changed by someone else. Reload it and try again.',
        );
      }
      throw error;
    }
  }

  // Entry point for GET /posts. Dispatches on sort; each branch owns its
  // own cursor format, so a cursor issued under one sort is meaningless
  // (and rejected) under another.
  //
  //discussed and top share the exact same
  // {sort, v, id} cursor shape (v means different things per sort, but the
  // decode/validate logic is identical)
  async list(
    limit: number,
    cursor: string | undefined,
    authorId: string | undefined,
    sort: PostSort = 'latest',
  ): Promise<ListResult> {
    if (sort === 'discussed') {
      return this.listDiscussed(limit, cursor, authorId);
    }
    if (sort === 'top') {
      return this.listTop(limit, cursor, authorId);
    }
    return this.listLatest(limit, cursor, authorId);
  }

  // Posts are only ever created in real time, never backdated, so _id
  // descending (ObjectIds embed a creation timestamp) already matches
  // createdAt descending — revised from an original {createdAt, _id} $or
  // cursor after .explain() showed that shape couldn't get tight index
  // bounds on a compound index (21 keys examined for 11 returned).
  private async listLatest(
    limit: number,
    cursor: string | undefined,
    authorId: string | undefined,
  ): Promise<ListResult> {
    const filter: Record<string, unknown> = { deletedAt: null };

    // Optional per-author listing ("posts made by you"). Same _id ordering
    // and cursor, just narrowed to one author; the DTO has already
    // validated it as an ObjectId.
    if (authorId) {
      filter.authorId = new Types.ObjectId(authorId);
    }

    if (cursor) {
      filter._id = { $lt: this.decodeLatestCursor(cursor) };
    }

    // Fetch one extra document — its presence (not its content) is what
    // tells us whether there's a next page, without a separate count query.
    const docs = await this.postModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate('authorId', 'fullName headline')
      .exec();

    const hasNextPage = docs.length > limit;
    const items = (hasNextPage
      ? docs.slice(0, limit)
      : docs) as unknown as PostWithAuthor[];

    const nextCursor = hasNextPage
      ? this.encodeLatestCursor(items[items.length - 1]._id as Types.ObjectId)
      : null;

    return { items, nextCursor };
  }

  // sort=discussed: commentCount desc, _id desc. Sorted on the raw stored
  // field (no displayCount floor) so the {deletedAt, commentCount, _id}
  // index added in CP1 actually serves the sort — a computed floored field
  // would defeat it. commentCount cannot drift negative in storage
  // (comments.service.ts clamps its decrement), so there is nothing for a
  // floor to protect against here the way there is for likeCount/dislikeCount
  // in the eventual sort=top path.
  private async listDiscussed(
    limit: number,
    cursor: string | undefined,
    authorId: string | undefined,
  ): Promise<ListResult> {
    const filter: Record<string, unknown> = { deletedAt: null };

    if (authorId) {
      filter.authorId = new Types.ObjectId(authorId);
    }

    if (cursor) {
      const { v, id } = this.decodeKeysetCursor(cursor, 'discussed');
      // Keyset page condition for ORDER BY commentCount DESC, _id DESC:
      // either strictly fewer comments than the last row seen, or the same
      // comment count with a strictly smaller _id (the tie-breaker).
      filter.$or = [
        { commentCount: { $lt: v } },
        { commentCount: v, _id: { $lt: id } },
      ];
    }

    const docs = await this.postModel
      .find(filter)
      .sort({ commentCount: -1, _id: -1 })
      .limit(limit + 1)
      .populate('authorId', 'fullName headline')
      .exec();

    const hasNextPage = docs.length > limit;
    const items = (hasNextPage
      ? docs.slice(0, limit)
      : docs) as unknown as PostWithAuthor[];

    const nextCursor = hasNextPage
      ? this.encodeKeysetCursor(
          'discussed',
          items[items.length - 1].commentCount,
          items[items.length - 1]._id as Types.ObjectId,
        )
      : null;

    return { items, nextCursor };
  }
  // sort=top: same Wilson-score formula as ranking.ts's computeRankScore,
  // expressed in Mongo aggregation operators so it can back a paginated
  // DB sort. The two are proved to match by posts-ranking.e2e-spec.ts's
  // parity test (CP6) — not by construction. Each stage below corresponds
  // 1:1 to a line of computeRankScore, in the same order, so the two are
  // easy to read side by side.
  //
  // Cost: score is computed live, not denormalized, so this is a full
  // collection scan for the {deletedAt: null} case (an authorId filter
  // narrows the scanned set via the existing {authorId,deletedAt,_id}
  // index before scoring runs, but the scoring/ordering step itself is
  // still unindexed either way). Acceptable at this project's scale;
  // documented as a known limitation, not silent. A future optimization
  // (denormalized rankScore + periodic recompute job) is out of scope here.
  private async listTop(
    limit: number,
    cursor: string | undefined,
    authorId: string | undefined,
  ): Promise<ListResult> {
    const Z2 = Z * Z;

    const match: Record<string, unknown> = { deletedAt: null };
    if (authorId) {
      match.authorId = new Types.ObjectId(authorId);
    }

    const pipeline: PipelineStage[] = [
      { $match: match },

      // likes/dislikes/comments floored, matching displayCount's
      // Math.max(0, stored ?? 0) semantics used everywhere else a raw
      // counter reaches a client.
      {
        $addFields: {
          likes: { $max: [0, '$likeCount'] },
          dislikes: { $max: [0, '$dislikeCount'] },
          comments: { $max: [0, '$commentCount'] },
        },
      },

      // n = likes + dislikes
      { $addFields: { n: { $add: ['$likes', '$dislikes'] } } },

      // p = likes / n, only when n > 0 — $cond means $divide is never
      // evaluated for n = 0, so there is no divide-by-zero risk from
      // this line (Mongo's $divide throws on a zero divisor, unlike JS).
      {
        $addFields: {
          p: {
            $cond: [{ $eq: ['$n', 0] }, 0, { $divide: ['$likes', '$n'] }],
          },
        },
      },

      // wilson = 0 when n == 0, else the Wilson lower bound. $cond again
      // short-circuits the unused branch, so the $divide/$sqrt below it
      // never runs for n = 0 either. max(0, ...) floors the rare tiny
      // negative float artifact the same way ranking.ts's
      // wilsonLowerBound does (verified: likes=0, dislikes=5 produces
      // ~-3.14e-17 from independent rounding in the two halves of the
      // numerator — a real float artifact, not hypothetical).
      {
        $addFields: {
          wilson: {
            $cond: [
              { $eq: ['$n', 0] },
              0,
              {
                $max: [
                  0,
                  {
                    $divide: [
                      {
                        $subtract: [
                          {
                            $add: [
                              '$p',
                              { $divide: [Z2, { $multiply: [2, '$n'] }] },
                            ],
                          },
                          {
                            $multiply: [
                              Z,
                              {
                                $sqrt: {
                                  $add: [
                                    {
                                      $divide: [
                                        {
                                          $multiply: [
                                            '$p',
                                            { $subtract: [1, '$p'] },
                                          ],
                                        },
                                        '$n',
                                      ],
                                    },
                                    {
                                      $divide: [
                                        Z2,
                                        {
                                          $multiply: [
                                            4,
                                            { $multiply: ['$n', '$n'] },
                                          ],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              },
                            ],
                          },
                        ],
                      },
                      { $add: [1, { $divide: [Z2, '$n'] }] },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },

      // score = wilson * VOTE_WEIGHT + comments * COMMENT_WEIGHT — same
      // constants ranking.ts exports, imported rather than re-declared.
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ['$wilson', VOTE_WEIGHT] },
              { $multiply: ['$comments', COMMENT_WEIGHT] },
            ],
          },
        },
      },
    ];

    if (cursor) {
      const { v, id } = this.decodeKeysetCursor(cursor, 'top');
      // Same seek-pagination shape as listDiscussed: strictly lower
      // score, or equal score with a strictly smaller _id tie-breaker.
      pipeline.push({
        $match: {
          $or: [{ score: { $lt: v } }, { score: v, _id: { $lt: id } }],
        },
      });
    }

    pipeline.push({ $sort: { score: -1, _id: -1 } }, { $limit: limit + 1 });

    const docs = await this.postModel.aggregate(pipeline).exec();

    const hasNextPage = docs.length > limit;
    const page = hasNextPage ? docs.slice(0, limit) : docs;

    // aggregate() returns plain objects, not hydrated Mongoose documents —
    // Model.populate() still works on them as long as the ref field
    // (authorId) is present, which it is: $addFields only ever added new
    // fields alongside it, never touched it.
    const populated = await this.postModel.populate(page, {
      path: 'authorId',
      select: 'fullName headline',
    });
    const items = populated as unknown as PostWithAuthor[];

    // v is read off this same aggregation output, never recomputed in JS,
    // so the cursor's equality half (score == v on the next page) can't be
    // thrown off by a JS/Mongo float divergence.
    const nextCursor = hasNextPage
      ? this.encodeKeysetCursor(
          'top',
          (page[page.length - 1] as { score: number }).score,
          page[page.length - 1]._id as Types.ObjectId,
        )
      : null;

    return { items, nextCursor };
  }
  // Bare base64-encoded ObjectId, not a JSON wrapper — with only one field
  // in a latest cursor, a JSON envelope buys nothing (shorter cursor, and
  // one less failure mode: no JSON.parse to fail defensively against).
  // Renamed from encodeCursor/decodeCursor (CP3) now that a second, JSON
  // keyset cursor format exists for discussed/top.
  private encodeLatestCursor(id: Types.ObjectId): string {
    return Buffer.from(String(id)).toString('base64');
  }

  // Bad base64 and an invalid ObjectId are the only two failure modes —
  // both still end up as a plain Error inside this try block, so both
  // still produce the same clean 400 rather than a 500. A discussed/top
  // cursor decoded here is JSON text, which is never a valid ObjectId, so
  // it 400s the same way — no special-case check needed for the
  // cross-sort-replay rejection in this direction.
  private decodeLatestCursor(cursor: string): Types.ObjectId {
    try {
      const id = Buffer.from(cursor, 'base64').toString('utf8');
      if (!isValidObjectId(id)) {
        throw new Error('cursor is not a valid ObjectId');
      }
      return new Types.ObjectId(id);
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  // Keyset cursor for discussed/top: base64(JSON{sort, v, id}). `sort` is
  // embedded and checked against the request's own sort so a cursor from
  // one sort is rejected (400), not silently misapplied, when replayed
  // against another.
  private encodeKeysetCursor(
    sort: 'discussed' | 'top',
    v: number,
    id: Types.ObjectId,
  ): string {
    return Buffer.from(JSON.stringify({ sort, v, id: String(id) })).toString(
      'base64',
    );
  }

  // A latest cursor decoded here is a bare ObjectId string, not JSON, so
  // JSON.parse throws and this 400s the same way — the cross-sort-replay
  // rejection holds in both directions without a special-case check.
  private decodeKeysetCursor(
    cursor: string,
    expectedSort: 'discussed' | 'top',
  ): KeysetCursor {
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid cursor');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new BadRequestException('Invalid cursor');
    }
    const { sort, v, id } = parsed as Record<string, unknown>;

    if (sort !== expectedSort) {
      throw new BadRequestException(
        `Cursor was issued for sort=${String(sort)}, not sort=${expectedSort}`,
      );
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new BadRequestException('Invalid cursor');
    }
    if (typeof id !== 'string' || !isValidObjectId(id)) {
      throw new BadRequestException('Invalid cursor');
    }

    return { v, id: new Types.ObjectId(id) };
  }
}
