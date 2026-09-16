import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { PortfolioProjectDto } from './dto/portfolio-project.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  // Injects the User model directly (via UsersModule's re-exported
  // MongooseModule, not a fresh forFeature() call) rather than going
  // through UsersService — profile is its own feature slice over the same
  // collection, mirroring how UsersService owns its own Mongoose calls
  // instead of delegating to another service.
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async getProfile(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // Only the fields actually present in the (partial) dto get set — an
  // omitted field leaves the existing value untouched. Same pattern as
  // UsersService.updateExperience's conditional $set build.
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const setFields: Record<string, unknown> = {};
    if (dto.headline !== undefined) setFields.headline = dto.headline;
    if (dto.bio !== undefined) setFields.bio = dto.bio;
    if (dto.skills !== undefined) setFields.skills = dto.skills;
    if (dto.portfolioProjects !== undefined) {
      setFields.portfolioProjects = dto.portfolioProjects;
    }

    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: setFields },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // Moved from UsersService verbatim — full replace, atomic, avoids the
  // read-modify-write race a plain .save() would have under
  // optimisticConcurrency (see AuthService).
  async updateSkills(userId: string, skills: string[]) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { skills }, { returnDocument: 'after' })
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // Same convention as updateSkills — full replace, single scalar field.
  async updateHeadline(userId: string, headline: string) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { headline }, { returnDocument: 'after' })
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateBio(userId: string, bio: string) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { bio }, { returnDocument: 'after' })
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // runValidators:true, same as updateProfile — portfolioProjects entries
  // carry Mongoose-level constraints (via the schema) that a bare
  // findByIdAndUpdate wouldn't otherwise enforce.
  async updatePortfolioProjects(
    userId: string,
    portfolioProjects: PortfolioProjectDto[],
  ) {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { portfolioProjects },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async addExperience(userId: string, dto: Record<string, unknown>) {
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
    dto: Record<string, unknown>,
  ) {
    // Only the fields actually present in the (partial) dto get set — an
    // omitted field leaves the existing value untouched.
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
