import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from './schemas/notification.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
  ) {}

  create(userId: string, message: string) {
    return this.notificationModel.create({ userId, message });
  }

  findForUser(userId: string) {
    return this.notificationModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .exec();
  }

  // Atomic, filter includes ownership — a null result unambiguously means
  // "not found or not yours", same pattern as UsersService's experience
  // routes (e.g. updateExperience/removeExperience).
  async markRead(userId: string, notificationId: string) {
    const notification = await this.notificationModel
      .findOneAndUpdate(
        { _id: notificationId, userId },
        { $set: { read: true } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  unreadCount(userId: string) {
    return this.notificationModel.countDocuments({ userId, read: false }).exec();
  }
}
