import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

const SYNC_API_KEY_HEADER = 'x-sync-api-key';

@Injectable()
export class SyncApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expectedApiKey = process.env.SYNC_API_KEY;
    if (!expectedApiKey) {
      throw new InternalServerErrorException(
        'SYNC_API_KEY is not configured on the server.',
      );
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
    const headerValue = request.headers?.[SYNC_API_KEY_HEADER];
    const providedApiKey = Array.isArray(headerValue)
      ? headerValue[0]
      : headerValue;

    if (!providedApiKey || providedApiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid or missing sync API key.');
    }

    return true;
  }
}
