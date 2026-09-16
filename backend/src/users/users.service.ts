import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserRole } from './schemas/user.schema';

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

  // Returns the raw document — passwordHash is already excluded by
  // select:false, and toJSON strips it again (plus __v) on serialization,
  // so no extra field-picking is needed here. Authorization (viewing
  // requires auth; editing is owner-or-admin) is enforced by the
  // controller, not here. Still used by updateFullName below for its
  // "before" snapshot — skills/experience reads now go through
  // ProfilesService.getProfile instead.
  async getProfileById(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // Mirrors ProfilesService.updateSkills's shape — full replace, atomic.
  async updateFullName(userId: string, fullName: string) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { fullName }, { returnDocument: 'after' })
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // Admin-only listing — hand-picked fields, no pagination (per spec: no
  // real users exist yet, and this isn't meant to scale to that yet either).
  async findAll() {
    return this.userModel
      .find()
      .select('fullName email role createdAt')
      .exec();
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
