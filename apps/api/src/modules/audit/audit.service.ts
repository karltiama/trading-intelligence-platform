import { Injectable } from '@nestjs/common';
import { AuditEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type RecordAuditEventInput = {
  eventType: AuditEventType;
  userEmail: string;
  accountId?: string;
  resourceId?: string;
  payload: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(input: RecordAuditEventInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        eventType: input.eventType,
        userEmail: input.userEmail,
        accountId: input.accountId,
        resourceId: input.resourceId,
        payload: input.payload,
      },
    });
  }
}
