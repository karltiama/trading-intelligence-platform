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
import { PaperOrderSide, StrategyName } from '@prisma/client';
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

type ExecuteFromActiveSignalsBody = {
  strategyName?: string;
  quantityPerSignal?: number;
  signalIds?: string[];
};

type UpdateGuardrailBody = {
  enabled?: boolean;
  cooldownSeconds?: number;
};

@Controller('automation')
export class AutomationController {
  constructor(
    private readonly automationService: AutomationService,
    private readonly accountContextService: AccountContextService,
  ) {}

  @Post('runs/from-active-signals')
  executeFromActiveSignals(
    @Body() body: ExecuteFromActiveSignalsBody,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('accountId') accountIdRaw?: string,
  ) {
    const strategyNameRaw = body.strategyName?.trim().toUpperCase();
    if (!strategyNameRaw) {
      throw new BadRequestException('strategyName is required.');
    }
    if (
      !Object.values(StrategyName).includes(strategyNameRaw as StrategyName)
    ) {
      throw new BadRequestException(
        'strategyName must be TREND_PULLBACK, RELATIVE_STRENGTH_BREAKOUT, or OVERSOLD_BOUNCE.',
      );
    }
    const strategyName = strategyNameRaw as StrategyName;

    const quantityPerSignal = body.quantityPerSignal ?? 1;
    if (
      !Number.isInteger(quantityPerSignal) ||
      quantityPerSignal <= 0
    ) {
      throw new BadRequestException(
        'quantityPerSignal must be a positive integer.',
      );
    }

    const signalIdsRaw = body.signalIds;
    if (signalIdsRaw !== undefined && !Array.isArray(signalIdsRaw)) {
      throw new BadRequestException('signalIds must be an array.');
    }
    const signalIds = signalIdsRaw
      ?.map((id) => id.trim())
      .filter((id) => id.length > 0);

    const accountId = accountIdRaw?.trim() || undefined;
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    return this.automationService.executeFromActiveSignals({
      strategyName,
      quantityPerSignal,
      signalIds: signalIds && signalIds.length > 0 ? signalIds : undefined,
      userEmail: principal.userEmail,
      accountId,
    });
  }

  @Post('runs')
  triggerRun(
    @Body() body: TriggerRunBody,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('accountId') accountIdRaw?: string,
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
        throw new BadRequestException(
          `signals[${index}].symbolId is required.`,
        );
      }

      const symbol = signal.symbol?.trim().toUpperCase();
      if (!symbol) {
        throw new BadRequestException(`signals[${index}].symbol is required.`);
      }

      const sideRaw = signal.side?.trim().toUpperCase();
      if (sideRaw !== 'BUY' && sideRaw !== 'SELL') {
        throw new BadRequestException(
          `signals[${index}].side must be BUY or SELL.`,
        );
      }
      const side: PaperOrderSide =
        sideRaw === 'BUY' ? PaperOrderSide.BUY : PaperOrderSide.SELL;

      if (typeof signal.quantity !== 'number') {
        throw new BadRequestException(
          `signals[${index}].quantity must be a number.`,
        );
      }

      const signalAt = signal.signalAt ? new Date(signal.signalAt) : new Date();
      if (Number.isNaN(signalAt.getTime())) {
        throw new BadRequestException(`signals[${index}].signalAt is invalid.`);
      }

      return {
        symbolId,
        symbol,
        side,
        signalAt,
        quantity: signal.quantity,
      };
    });

    const accountId = accountIdRaw?.trim() || undefined;
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    return this.automationService.triggerManualRun({
      strategy,
      signals,
      userEmail: principal.userEmail,
      accountId,
    });
  }

  @Get('guardrails/:strategy')
  getGuardrail(
    @Param('strategy') strategyRaw: string,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
  ) {
    const strategy = strategyRaw.trim();
    if (!strategy) {
      throw new BadRequestException('strategy is required.');
    }
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    return this.automationService.getGuardrail(principal.userEmail, strategy);
  }

  @Post('guardrails/:strategy')
  updateGuardrail(
    @Param('strategy') strategyRaw: string,
    @Body() body: UpdateGuardrailBody,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
  ) {
    const strategy = strategyRaw.trim();
    if (!strategy) {
      throw new BadRequestException('strategy is required.');
    }
    if (body.enabled === undefined && body.cooldownSeconds === undefined) {
      throw new BadRequestException(
        'at least one of enabled or cooldownSeconds must be provided.',
      );
    }
    if (
      body.cooldownSeconds !== undefined &&
      (!Number.isInteger(body.cooldownSeconds) || body.cooldownSeconds < 0)
    ) {
      throw new BadRequestException('cooldownSeconds must be an integer >= 0.');
    }
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    return this.automationService.updateGuardrail({
      userEmail: principal.userEmail,
      strategy,
      enabled: body.enabled,
      cooldownSeconds: body.cooldownSeconds,
    });
  }

  @Get('runs')
  listRuns(
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
    @Query('status') statusRaw?: string,
    @Query('strategy') strategyRaw?: string,
    @Query('cursor') cursorRaw?: string,
    @Query('accountId') accountIdRaw?: string,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
  ) {
    let limit = 25;
    if (limitRaw) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
        throw new BadRequestException(
          'limit must be an integer between 1 and 100.',
        );
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
    const accountId = accountIdRaw?.trim() || undefined;
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    if (cursorRaw) {
      return this.automationService.listRunsPage({
        userEmail: principal.userEmail,
        accountId,
        strategy,
        status,
        limit,
        cursor: cursorRaw,
      });
    }
    return this.automationService.listRuns(
      principal.userEmail,
      {
        limit,
        offset,
        status,
        strategy,
      },
      accountId,
    );
  }

  @Get('runs/:id')
  getRun(
    @Param('id') runId: string,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('accountId') accountIdRaw?: string,
  ) {
    const id = runId.trim();
    if (!id) {
      throw new BadRequestException('run id is required.');
    }
    const accountId = accountIdRaw?.trim() || undefined;
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    return this.automationService.getRunDetails(
      id,
      principal.userEmail,
      accountId,
    );
  }

  @Get('runs/:id/signals')
  listRunSignals(
    @Param('id') runId: string,
    @Headers('x-user-email') headerUserEmail?: string,
    @Query('userEmail') queryUserEmail?: string,
    @Query('accountId') accountIdRaw?: string,
  ) {
    const id = runId.trim();
    if (!id) {
      throw new BadRequestException('run id is required.');
    }
    const accountId = accountIdRaw?.trim() || undefined;
    const principal = this.accountContextService.resolvePrincipal({
      headerUserEmail,
      queryUserEmail,
    });
    return this.automationService.listRunSignals(
      id,
      principal.userEmail,
      accountId,
    );
  }
}
