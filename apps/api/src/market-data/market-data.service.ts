import { Injectable } from '@nestjs/common';

@Injectable()
export class MarketDataService {
  getStatus(): { status: string } {
    return { status: 'not_configured' };
  }
}
