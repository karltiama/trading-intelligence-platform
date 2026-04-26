import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PaperOrderSide } from '@prisma/client';
import { AccountContextService } from '../account-context/account-context.service';
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
  constructor(
    private readonly automationService: AutomationService,
    private readonly accountContextService: AccountContextService,
  ) {}

  @Post('runs')
  triggerRun(
    @Body() body: TriggerRunBody,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
  ) {
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

    const userEmail = this.accountContextService.resolveUserEmail(
      headerUserEmail ?? queryUserEmail,
    );
    return this.automationService.triggerManualRun({
      strategy,
      signals,
      userEmail,
    });
  }

  @Get('runs')
  listRuns(
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
    @Query('status') statusRaw?: string,
    @Query('strategy') strategyRaw?: string,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
  ) {
    let limit = 25;
    if (limitRaw) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
        throw new BadRequestException('limit must be an integer between 1 and 100.');
      }
      limit = parsed;
    }

    let offset = 0;
    if (offsetRaw) {
      const parsed = Number.parseInt(offsetRaw, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new BadRequestException('offset must be an integer >= 0.');
      }
      offset = parsed;
    }

    let status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | undefined;
    if (statusRaw) {
      const normalized = statusRaw.trim().toUpperCase();
      if (
        normalized !== 'RUNNING' &&
        normalized !== 'SUCCESS' &&
        normalized !== 'FAILED' &&
        normalized !== 'CANCELLED'
      ) {
        throw new BadRequestException(
          'status must be one of RUNNING, SUCCESS, FAILED, CANCELLED.',
        );
      }
      status = normalized;
    }

    const strategy = strategyRaw?.trim() || undefined;
    const userEmail = this.accountContextService.resolveUserEmail(
      headerUserEmail ?? queryUserEmail,
    );
    return this.automationService.listRuns(userEmail, {
      limit,
      offset,
      status,
      strategy,
    });
  }

  @Get('runs/:id')
  getRun(
    @Param('id') runId: string,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
  ) {
    const id = runId.trim();
    if (!id) {
      throw new BadRequestException('run id is required.');
    }
    const userEmail = this.accountContextService.resolveUserEmail(
      headerUserEmail ?? queryUserEmail,
    );
    return this.automationService.getRunDetails(id, userEmail);
  }

  @Get('runs/:id/signals')
  listRunSignals(
    @Param('id') runId: string,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
  ) {
    const id = runId.trim();
    if (!id) {
      throw new BadRequestException('run id is required.');
    }
    const userEmail = this.accountContextService.resolveUserEmail(
      headerUserEmail ?? queryUserEmail,
    );
    return this.automationService.listRunSignals(id, userEmail);
  }
}
