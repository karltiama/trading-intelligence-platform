import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { SignalStatus, StrategyName } from '@prisma/client';
import { SignalsService } from './signals.service';

@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Post('scan')
  scan(@Query('strategyName') strategyNameRaw?: string) {
    let strategyName: StrategyName = StrategyName.TREND_PULLBACK;
    if (strategyNameRaw) {
      const normalized = strategyNameRaw.trim().toUpperCase();
      if (!Object.values(StrategyName).includes(normalized as StrategyName)) {
        throw new BadRequestException(
          'strategyName must be TREND_PULLBACK, RELATIVE_STRENGTH_BREAKOUT, or OVERSOLD_BOUNCE.',
        );
      }
      strategyName = normalized as StrategyName;
    }
    return this.signalsService.scanSignals(strategyName);
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
        throw new BadRequestException(
          'strategyName must be TREND_PULLBACK, RELATIVE_STRENGTH_BREAKOUT, or OVERSOLD_BOUNCE.',
        );
      }
      strategyName = normalized as StrategyName;
    }

    const symbol = symbolRaw?.trim().toUpperCase() || undefined;
    return this.signalsService.list({ status, strategyName, symbol });
  }

  @Get('scan-history')
  listScanHistory(
    @Query('strategyName') strategyNameRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    let strategyName: StrategyName | undefined;
    if (strategyNameRaw) {
      const normalized = strategyNameRaw.trim().toUpperCase();
      if (!Object.values(StrategyName).includes(normalized as StrategyName)) {
        throw new BadRequestException(
          'strategyName must be TREND_PULLBACK, RELATIVE_STRENGTH_BREAKOUT, or OVERSOLD_BOUNCE.',
        );
      }
      strategyName = normalized as StrategyName;
    }

    let limit = 20;
    if (limitRaw) {
      const parsed = Number(limitRaw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        throw new BadRequestException(
          'limit must be an integer between 1 and 100.',
        );
      }
      limit = parsed;
    }

    return this.signalsService.listScanHistory(strategyName, limit);
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
