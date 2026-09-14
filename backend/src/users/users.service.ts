import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AddExperienceDto } from './dto/add-experience.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
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
  // controller, not here.
  async getProfileById(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // Full replace, atomic — avoids the read-modify-write race a plain
  // .save() would have under optimisticConcurrency (see AuthService).
  async updateSkills(userId: string, skills: string[]) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { skills }, { returnDocument: 'after' })
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // Mirrors updateSkills's shape — full replace, atomic.
  async updateFullName(userId: string, fullName: string) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { fullName }, { returnDocument: 'after' })
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async addExperience(userId: string, dto: AddExperienceDto) {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $push: { experiences: dto } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateExperience(
    userId: string,
    experienceId: string,
    dto: UpdateExperienceDto,
  ) {
    // Only the fields actually present in the (partial) dto get set —
    // an omitted field leaves the existing value untouched.
    const setFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        setFields[`experiences.$.${key}`] = value;
      }
    }

    // The filter itself requires the experience to exist on this user, so
    // a null result unambiguously means "not found" (wrong user or wrong
    // experience id) rather than "matched but nothing changed".
    const filter = { _id: userId, 'experiences._id': experienceId };
    const user = await (
      Object.keys(setFields).length > 0
        ? this.userModel.findOneAndUpdate(
            filter,
            { $set: setFields },
            { returnDocument: 'after' },
          )
        : this.userModel.findOne(filter)
    ).exec();

    if (!user) {
      throw new NotFoundException('Experience not found');
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

  async removeExperience(userId: string, experienceId: string) {
    // Same reasoning as updateExperience: requiring the experience in the
    // filter means a null result means "not found", not "$pull matched
    // the user but removed nothing".
    const user = await this.userModel
      .findOneAndUpdate(
        { _id: userId, 'experiences._id': experienceId },
        { $pull: { experiences: { _id: experienceId } } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!user) {
      throw new NotFoundException('Experience not found');
    }
    return user;
  }
}
