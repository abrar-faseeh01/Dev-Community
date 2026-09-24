import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { AuditLog } from '../../src/audit/schemas/audit-log.schema';
import { Comment } from '../../src/comments/schemas/comment.schema';
import { Notification } from '../../src/notifications/schemas/notification.schema';
import { Post } from '../../src/posts/schemas/post.schema';
import { Reaction } from '../../src/reactions/schemas/reaction.schema';
import { User, UserRole } from '../../src/users/schemas/user.schema';

// Every throwaway account carries this marker in its email, so anything a
// crashed run leaves behind is positively identifiable. The sweep pattern is
// anchored at both ends: it can only match addresses this file generates.
const MARKER = 'e2e-day9-';
const EMAIL_DOMAIN = '@example.test';
const MARKER_PREFIX = new RegExp(`^${MARKER}`);
const SWEEP_PATTERN = /^e2e-day9-[0-9a-f]+-\d+@example\.test$/;

// More leftover users than this means something is wrong (a marker that is
// too loose, or a runaway loop), so the sweep stops instead of deleting.
const DEFAULT_MAX_SWEEP_USERS = 100;

export type E2eUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  // Send as the Cookie header. Signed with the app's own JwtService, so it
  // is a real session for a throwaway user without ever calling /auth/login.
  cookie: string;
};

export type CleanupResult = {
  users: number;
  // Tracked users that were already gone (a test may delete one on purpose).
  usersMissing: number;
  posts: number;
  comments: number;
  auditLogs: number;
  notifications: number;
  reactions: number;
};

const EMPTY_RESULT: CleanupResult = {
  users: 0,
  usersMissing: 0,
  posts: 0,
  comments: 0,
  auditLogs: 0,
  notifications: 0,
  reactions: 0,
};

function toObjectIds(ids: Iterable<string>): Types.ObjectId[] {
  return [...new Set(ids)].map((id) => new Types.ObjectId(id));
}

// Creates throwaway users and removes everything tied to them. The rules
// that keep it away from real data:
//   - rows are removed only by tracked ObjectIds (the user's own id, the
//     posts they authored, the comments on those posts); there is no
//     filter-based deleteMany on anything but the id lists;
//   - a tracked user id is always one of ours: createUser() generates the
//     marker email itself, and trackUser() refuses any account without it.
//     The final user delete also requires the marker, as a second check;
//   - the sweep of an earlier crashed run is the one place that looks users
//     up by pattern, and it deletes only by the ids that lookup returned.
export class E2eData {
  // Different per instance, so the sweep can tell "left over from an earlier
  // run" apart from "created by this run" and leave the latter alone.
  readonly runId = randomBytes(4).toString('hex');

  private counter = 0;
  private readonly userIds = new Set<string>();
  private readonly postIds = new Set<string>();
  private readonly commentIds = new Set<string>();

  readonly models: {
    user: Model<User>;
    post: Model<Post>;
    comment: Model<Comment>;
    reaction: Model<Reaction>;
    auditLog: Model<AuditLog>;
    notification: Model<Notification>;
  };
  private readonly jwtService: JwtService;

  constructor(app: INestApplication) {
    this.models = {
      user: app.get(getModelToken(User.name), { strict: false }),
      post: app.get(getModelToken(Post.name), { strict: false }),
      comment: app.get(getModelToken(Comment.name), { strict: false }),
      reaction: app.get(getModelToken(Reaction.name), { strict: false }),
      auditLog: app.get(getModelToken(AuditLog.name), { strict: false }),
      notification: app.get(getModelToken(Notification.name), {
        strict: false,
      }),
    };
    this.jwtService = app.get(JwtService, { strict: false });
  }

  // passwordHash is random bytes, not a bcrypt hash, so nobody can ever log
  // in as this account: it only exists to be signed for.
  async createUser(role: UserRole = 'user'): Promise<E2eUser> {
    const n = ++this.counter;
    const email = `${MARKER}${this.runId}-${n}${EMAIL_DOMAIN}`;
    const fullName = `E2E User ${this.runId}-${n}`;

    const user = await this.models.user.create({
      fullName,
      email,
      passwordHash: randomBytes(32).toString('hex'),
      role,
    });
    const id = String(user._id);
    this.userIds.add(id);

    const token = this.jwtService.sign({ sub: id, email, role });
    return { id, email, fullName, role, cookie: `access_token=${token}` };
  }

  trackPost(id: string): void {
    this.postIds.add(id);
  }

  trackComment(id: string): void {
    this.commentIds.add(id);
  }

  // For a user the test created some other way. Only an account whose email
  // carries the marker is ever tracked: for anything else this returns false
  // and tracks nothing, so nothing tied to a real account (its posts, audit
  // entries, notifications) can end up in a cleanup.
  async trackUser(id: string): Promise<boolean> {
    const found = await this.models.user
      .findOne({ _id: id, email: MARKER_PREFIX })
      .select('_id')
      .lean()
      .exec();
    if (!found) return false;
    this.userIds.add(id);
    return true;
  }

  async cleanup(): Promise<CleanupResult> {
    const result = await this.removeByIds(
      [...this.userIds],
      [...this.postIds],
      [...this.commentIds],
    );
    // Only forget the ids once they are gone, so a failed cleanup can be
    // retried instead of silently leaving rows behind.
    this.userIds.clear();
    this.postIds.clear();
    this.commentIds.clear();
    return result;
  }

  // Recovers rows from an earlier run that crashed before its cleanup. Logs
  // exactly which users it matched before it deletes anything.
  async sweepLeftovers(
    options: { maxUsers?: number } = {},
  ): Promise<CleanupResult> {
    const maxUsers = options.maxUsers ?? DEFAULT_MAX_SWEEP_USERS;
    const ownPrefix = `${MARKER}${this.runId}-`;

    const matched = await this.models.user
      .find({ email: SWEEP_PATTERN })
      .select('_id email')
      .lean()
      .exec();
    const leftovers = matched.filter((u) => !u.email.startsWith(ownPrefix));
    if (leftovers.length === 0) return { ...EMPTY_RESULT };

    console.log(
      `[e2e] sweep matched ${leftovers.length} leftover throwaway user(s): ` +
        leftovers.map((u) => u.email).join(', '),
    );
    if (leftovers.length > maxUsers) {
      throw new Error(
        `[e2e] sweep matched ${leftovers.length} users (limit ${maxUsers}); ` +
          'refusing to delete anything.',
      );
    }

    return this.removeByIds(
      leftovers.map((u) => String(u._id)),
      [],
      [],
    );
  }

  private async removeByIds(
    userIdList: string[],
    postIdList: string[],
    commentIdList: string[],
  ): Promise<CleanupResult> {
    const userIds = toObjectIds(userIdList);

    // Posts authored by a throwaway user are throwaway too, even if the test
    // never tracked their ids (for example one created through the API).
    const authoredPostIds = userIds.length
      ? (
          await this.models.post
            .find({ authorId: { $in: userIds } })
            .select('_id')
            .lean()
            .exec()
        ).map((p) => String(p._id))
      : [];
    const postIds = toObjectIds([...postIdList, ...authoredPostIds]);
    const commentIds = toObjectIds(commentIdList);

    const result: CleanupResult = { ...EMPTY_RESULT };

    // Every clause is keyed on a tracked id: the throwaway posts, the
    // throwaway users, or comment ids the test recorded.
    const commentClauses: Record<string, unknown>[] = [];
    if (postIds.length) commentClauses.push({ postId: { $in: postIds } });
    if (userIds.length) commentClauses.push({ authorId: { $in: userIds } });
    if (commentIds.length) commentClauses.push({ _id: { $in: commentIds } });
    if (commentClauses.length) {
      const res = await this.models.comment.deleteMany({
        $or: commentClauses,
      });
      result.comments = res.deletedCount;
    }

    // Reactions are removed by tracked ids only: the ones a throwaway user
    // made, and any on a throwaway post or a tracked comment.
    const reactionClauses: Record<string, unknown>[] = [];
    if (userIds.length) reactionClauses.push({ userId: { $in: userIds } });
    if (postIds.length) {
      reactionClauses.push({ targetType: 'post', targetId: { $in: postIds } });
    }
    if (commentIds.length) {
      reactionClauses.push({
        targetType: 'comment',
        targetId: { $in: commentIds },
      });
    }
    if (reactionClauses.length) {
      const res = await this.models.reaction.deleteMany({
        $or: reactionClauses,
      });
      result.reactions = res.deletedCount;
    }

    if (userIds.length) {
      const audit = await this.models.auditLog.deleteMany({
        $or: [
          { adminId: { $in: userIds } },
          { targetUserId: { $in: userIds } },
        ],
      });
      result.auditLogs = audit.deletedCount;

      const notes = await this.models.notification.deleteMany({
        userId: { $in: userIds },
      });
      result.notifications = notes.deletedCount;
    }

    if (postIds.length) {
      const posts = await this.models.post.deleteMany({ _id: { $in: postIds } });
      result.posts = posts.deletedCount;
    }

    if (userIds.length) {
      const users = await this.models.user.deleteMany({
        _id: { $in: userIds },
        email: MARKER_PREFIX,
      });
      result.users = users.deletedCount;
      result.usersMissing = userIds.length - users.deletedCount;
    }

    return result;
  }
}
