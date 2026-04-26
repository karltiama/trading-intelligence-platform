import { BadRequestException, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SignalStatus, StrategyName } from '@prisma/client';
import { SignalsService } from './signals.service';

@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Post('scan')
  scan() {
    return this.signalsService.scanTrendPullbackSignals();
  }

  @Get()
  list(
    @Query('status') statusRaw?: string,
    @Query('strategyName') strategyNameRaw?: string,
    @Query('symbol') symbolRaw?: string,
  ) {
    let status: SignalStatus | undefined;
    if (statusRaw) {
      const normalized = statusRaw.trim().toUpperCase();
      if (!Object.values(SignalStatus).includes(normalized as SignalStatus)) {
        throw new BadRequestException(
          'status must be one of ACTIVE, EXPIRED, INVALIDATED.',
        );
      }
      status = normalized as SignalStatus;
    }

    let strategyName: StrategyName | undefined;
    if (strategyNameRaw) {
      const normalized = strategyNameRaw.trim().toUpperCase();
      if (!Object.values(StrategyName).includes(normalized as StrategyName)) {
        throw new BadRequestException('strategyName must be TREND_PULLBACK.');
      }
      strategyName = normalized as StrategyName;
    }

    const symbol = symbolRaw?.trim().toUpperCase() || undefined;
    return this.signalsService.list({ status, strategyName, symbol });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    const signalId = id.trim();
    if (!signalId) {
      throw new BadRequestException('signal id is required.');
    }
    return this.signalsService.getById(signalId);
  }
}
