import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Error as MongooseError,
  isValidObjectId,
  Model,
  Types,
} from 'mongoose';
import { CreatePostDto } from './dto/create-post.dto';
import { Post } from './schemas/post.schema';

// The shape .populate('authorId', 'fullName headline') actually produces
// at runtime — overrides Post.authorId's declared Types.ObjectId type for
// callers that know they populated it.
export type PopulatedAuthor = {
  _id: Types.ObjectId;
  fullName: string;
  headline?: string;
};

export type PostWithAuthor = Post & { authorId: PopulatedAuthor };

@Injectable()
export class PostsService {
  constructor(@InjectModel(Post.name) private postModel: Model<Post>) {}

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
    await post.populate('authorId', 'fullName headline');
    return post as unknown as PostWithAuthor;
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

  // Posts are only ever created in real time, never backdated, so _id
  // descending (ObjectIds embed a creation timestamp) already matches
  // createdAt descending — revised from an original {createdAt, _id} $or
  // cursor after .explain() showed that shape couldn't get tight index
  // bounds on a compound index (21 keys examined for 11 returned).
  async list(
    limit: number,
    cursor?: string,
  ): Promise<{ items: PostWithAuthor[]; nextCursor: string | null }> {
    const filter: Record<string, unknown> = { deletedAt: null };

    if (cursor) {
      filter._id = { $lt: this.decodeCursor(cursor) };
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
    const items = (hasNextPage ? docs.slice(0, limit) : docs) as unknown as PostWithAuthor[];

    const nextCursor = hasNextPage
      ? this.encodeCursor(items[items.length - 1]._id as Types.ObjectId)
      : null;

    return { items, nextCursor };
  }

  // Bare base64-encoded ObjectId, not a JSON wrapper — with only one field
  // left in the cursor after dropping createdAt, a JSON envelope buys
  // nothing (shorter cursor, and one less failure mode: no JSON.parse to
  // fail defensively against).
  private encodeCursor(id: Types.ObjectId): string {
    return Buffer.from(String(id)).toString('base64');
  }

  // Bad base64 and an invalid ObjectId are the only two failure modes now
  // (no JSON, no date) — both still end up as a plain Error inside this
  // try block, so both still produce the same clean 400 rather than a 500.
  private decodeCursor(cursor: string): Types.ObjectId {
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
}
