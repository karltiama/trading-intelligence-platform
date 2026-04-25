import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PaperOrderSide } from '@prisma/client';
import { AutomationService } from './automation.service';

type RunSignalBody = {
  symbolId?: string;
  symbol?: string;
  side?: string;
  signalAt?: string;
  quantity?: number;
};

type TriggerRunBody = {
  strategy?: string;
  signals?: RunSignalBody[];
};

@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Post('runs')
  triggerRun(@Body() body: TriggerRunBody) {
    const strategy = body.strategy?.trim();
    if (!strategy) {
      throw new BadRequestException('strategy is required.');
    }
    const signalsRaw = body.signals ?? [];
    if (!Array.isArray(signalsRaw)) {
      throw new BadRequestException('signals must be an array.');
    }

    const signals = signalsRaw.map((signal, index) => {
      const symbolId = signal.symbolId?.trim();
      if (!symbolId) {
        throw new BadRequestException(`signals[${index}].symbolId is required.`);
      }

      const symbol = signal.symbol?.trim().toUpperCase();
      if (!symbol) {
        throw new BadRequestException(`signals[${index}].symbol is required.`);
      }

      const sideRaw = signal.side?.trim().toUpperCase();
      if (sideRaw !== 'BUY' && sideRaw !== 'SELL') {
        throw new BadRequestException(`signals[${index}].side must be BUY or SELL.`);
      }

      if (typeof signal.quantity !== 'number') {
        throw new BadRequestException(`signals[${index}].quantity must be a number.`);
      }

      const signalAt = signal.signalAt ? new Date(signal.signalAt) : new Date();
      if (Number.isNaN(signalAt.getTime())) {
        throw new BadRequestException(`signals[${index}].signalAt is invalid.`);
      }

      return {
        symbolId,
        symbol,
        side: sideRaw as PaperOrderSide,
        signalAt,
        quantity: signal.quantity,
      };
    });

    return this.automationService.triggerManualRun({
      strategy,
      signals,
    });
  }

  @Get('runs')
  listRuns(@Query('limit') limitRaw?: string) {
    let limit = 25;
    if (limitRaw) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
        throw new BadRequestException('limit must be an integer between 1 and 100.');
      }
      limit = parsed;
    }

    return this.automationService.listRuns(limit);
  }

  @Get('runs/:id')
  getRun(@Param('id') runId: string) {
    const id = runId.trim();
    if (!id) {
      throw new BadRequestException('run id is required.');
    }
    return this.automationService.getRunDetails(id);
  }

  @Get('runs/:id/signals')
  listRunSignals(@Param('id') runId: string) {
    const id = runId.trim();
    if (!id) {
      throw new BadRequestException('run id is required.');
    }
    return this.automationService.listRunSignals(id);
  }
}
