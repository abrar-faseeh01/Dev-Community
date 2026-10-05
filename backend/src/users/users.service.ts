import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserRole } from './schemas/user.schema';

// Signed-in devices a user can have at once. A sixth login evicts the oldest.
export const MAX_REFRESH_SESSIONS = 5;

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  // Includes passwordHash — for AuthService's internal use only (login compare).
  findByEmailWithPassword(email: string) {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  // Includes passwordHash — needed to verify currentPassword before a credentials change.
  findByIdWithPassword(id: string) {
    return this.userModel.findById(id).select('+passwordHash').exec();
  }

  // Refresh-token bookkeeping. Each of these is one atomic updateOne, not a
  // load-modify-save: two logins or a login and a logout racing each other must
  // not overwrite one another's change, and save() would also trip the user
  // schema's optimisticConcurrency. timestamps:false keeps updatedAt meaning
  // "the profile changed", not "someone signed in".
  addRefreshHash(userId: string, hash: string) {
    return this.userModel
      .updateOne(
        { _id: userId },
        {
          // $slice keeps the newest MAX_REFRESH_SESSIONS, so a sixth login
          // evicts the oldest session.
          $push: {
            refreshTokenHashes: {
              $each: [hash],
              $slice: -MAX_REFRESH_SESSIONS,
            },
          },
        },
        { timestamps: false },
      )
      .exec();
  }

  async hasRefreshHash(userId: string, hash: string): Promise<boolean> {
    const found = await this.userModel
      .exists({ _id: userId, refreshTokenHashes: hash })
      .exec();
    return found !== null;
  }

  removeRefreshHash(userId: string, hash: string) {
    return this.userModel
      .updateOne(
        { _id: userId },
        { $pull: { refreshTokenHashes: hash } },
        { timestamps: false },
      )
      .exec();
  }

  // A credential change ends every other session: only the new one survives.
  replaceRefreshHashes(userId: string, hashes: string[]) {
    return this.userModel
      .updateOne(
        { _id: userId },
        { $set: { refreshTokenHashes: hashes } },
        { timestamps: false },
      )
      .exec();
  }

  // AuthService.signup() will always call this without `role`,
  // so it defaults to 'user' — role is never client-controlled.
  create(data: {
    fullName: string;
    email: string;
    passwordHash: string;
    role?: UserRole;
  }) {
    return this.userModel.create({
      fullName: data.fullName,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      role: data.role ?? 'user',
    });
  }

  // Admin-only listing — hand-picked fields, no pagination (per spec: no
  // real users exist yet, and this isn't meant to scale to that yet either).
  async findAll() {
    return this.userModel.find().select('fullName email role createdAt').exec();
  }

  async deleteUser(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role === 'admin') {
      // Deleting an admin through this endpoint — including an admin
      // deleting themselves — would risk leaving zero admins with no way
      // to promote a new one. Blocked unconditionally.
      throw new ForbiddenException('Admin accounts cannot be deleted');
    }
    await this.userModel.deleteOne({ _id: id }).exec();
    // Pre-deletion snapshot — the caller needs it for the audit log, since
    // there's nothing left to read afterward.
    return user;
  }
}
