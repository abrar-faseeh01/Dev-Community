import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditAction, AuditLog } from './schemas/audit-log.schema';

export type AuditLogEntry = {
  adminId: string;
  adminFullName: string;
  targetUserId: string;
  targetFullName: string;
  action: AuditAction;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  reason?: string;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLog>,
  ) {}

  log(entry: AuditLogEntry) {
    return this.auditLogModel.create(entry);
  }

  findAll() {
    return this.auditLogModel.find().sort({ createdAt: -1 }).exec();
  }
}
