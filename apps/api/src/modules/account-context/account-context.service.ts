import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class AccountContextService {
  resolveUserEmail(input?: string | null): string {
    const normalized = input?.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException(
        'user context is required. Provide x-user-email header or userEmail query.',
      );
    }
    if (!normalized.includes('@')) {
      throw new BadRequestException('user context must be a valid email.');
    }
    return normalized;
  }
}
