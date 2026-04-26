import { BadRequestException, Injectable } from '@nestjs/common';

export type AuthenticatedPrincipalSource = 'header' | 'query';

export type AuthenticatedPrincipal = {
  userEmail: string;
  source: AuthenticatedPrincipalSource;
};

@Injectable()
export class AccountContextService {
  resolvePrincipal(input: {
    headerUserEmail?: string | null;
    queryUserEmail?: string | null;
  }): AuthenticatedPrincipal {
    const headerNormalized = this.normalizeEmail(input.headerUserEmail);
    if (headerNormalized) {
      return {
        userEmail: headerNormalized,
        source: 'header',
      };
    }

    const queryNormalized = this.normalizeEmail(input.queryUserEmail);
    if (queryNormalized) {
      return {
        userEmail: queryNormalized,
        source: 'query',
      };
    }

    throw new BadRequestException(
      'user context is required. Provide x-user-email header or userEmail query.',
    );
  }

  resolveUserEmail(input?: string | null): string {
    const normalized = this.normalizeEmail(input);
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

  private normalizeEmail(input?: string | null): string | null {
    const normalized = input?.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (!normalized.includes('@')) {
      throw new BadRequestException('user context must be a valid email.');
    }
    return normalized;
  }
}
