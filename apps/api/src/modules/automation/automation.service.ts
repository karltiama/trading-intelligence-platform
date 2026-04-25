import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaperOrderSide } from '@prisma/client';
import {
  PaperTradingService,
  type PlaceMarketOrderResult,
} from '../paper-trading/paper-trading.service';
import { RiskService } from '../risk/risk.service';
import { AutomationRepository } from './automation.repository';

export type AutomationSignalInput = {
  symbolId: string;
  symbol: string;
  side: PaperOrderSide;
  signalAt: Date;
  quantity: number;
};

export type AutomationRunResult = {
  runId: string;
  strategy: string;
  totalSignals: number;
  placed: number;
  duplicateSkipped: number;
  rejectedRisk: number;
  failed: number;
  status: 'SUCCESS' | 'FAILED';
};

export type AutomationRunListItem = {
  runId: string;
  strategy: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  startedAt: string;
  finishedAt: string | null;
  notes: string | null;
};

export type AutomationRunDetails = AutomationRunListItem & {
  summary: {
    totalSignals: number;
    placed: number;
    duplicateSkipped: number;
    rejectedRisk: number;
    failed: number;
  };
};

export type AutomationSignalExecutionItem = {
  executionId: string;
  signalKey: string;
  symbol: string;
  side: PaperOrderSide;
  status:
    | 'PENDING'
    | 'PLACED'
    | 'SKIPPED_DUPLICATE'
    | 'REJECTED_RISK'
    | 'FAILED';
  reason: string | null;
  orderId: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class AutomationService {
  constructor(
    private readonly automationRepository: AutomationRepository,
    private readonly paperTradingService: PaperTradingService,
    private readonly riskService: RiskService,
  ) {}

  async executeRun(params: {
    strategy: string;
    signals: AutomationSignalInput[];
  }): Promise<AutomationRunResult> {
    const strategy = params.strategy.trim();
    if (!strategy) {
      throw new BadRequestException('strategy is required.');
    }

    const run = await this.automationRepository.createRun(strategy);
    let placed = 0;
    let duplicateSkipped = 0;
    let rejectedRisk = 0;
    let failed = 0;

    for (const signal of params.signals) {
      const signalKey = this.toSignalKey(strategy, signal);

      const execution = await this.automationRepository.createSignalExecution({
        runId: run.id,
        signalKey,
        symbolId: signal.symbolId,
        side: signal.side,
      });

      if (!execution) {
        duplicateSkipped += 1;
        continue;
      }

      const risk = await this.riskService.evaluateOrder({
        symbol: signal.symbol,
        side: signal.side,
        quantity: signal.quantity,
      });
      if (!risk.allowed) {
        rejectedRisk += 1;
        await this.automationRepository.markSignalExecutionRejectedRisk({
          executionId: execution.id,
          reason: risk.reason,
        });
        continue;
      }

      try {
        const order = await this.placeOrderFromSignal(signal);
        await this.automationRepository.markSignalExecutionPlaced({
          executionId: execution.id,
          orderId: order.orderId,
        });
        placed += 1;
      } catch (error) {
        failed += 1;
        await this.automationRepository.markSignalExecutionFailed({
          executionId: execution.id,
          reason:
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : String(error),
        });
      }
    }

    const status = failed > 0 ? 'FAILED' : 'SUCCESS';
    await this.automationRepository.completeRun({
      runId: run.id,
      status,
      notes: `placed=${placed};duplicateSkipped=${duplicateSkipped};rejectedRisk=${rejectedRisk};failed=${failed}`,
    });

    return {
      runId: run.id,
      strategy,
      totalSignals: params.signals.length,
      placed,
      duplicateSkipped,
      rejectedRisk,
      failed,
      status,
    };
  }

  triggerManualRun(params: {
    strategy: string;
    signals: AutomationSignalInput[];
  }): Promise<AutomationRunResult> {
    return this.executeRun(params);
  }

  async listRuns(limit = 25): Promise<AutomationRunListItem[]> {
    const rows = await this.automationRepository.listRuns(limit);
    return rows.map((row) => ({
      runId: row.id,
      strategy: row.strategy,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      notes: row.notes,
    }));
  }

  async getRunDetails(runId: string): Promise<AutomationRunDetails> {
    const run = await this.automationRepository.findRun(runId);
    if (!run) {
      throw new NotFoundException(`Automation run not found: ${runId}`);
    }

    const signals = await this.automationRepository.listRunSignalExecutions(runId);
    const summary = {
      totalSignals: signals.length,
      placed: signals.filter((s) => s.status === 'PLACED').length,
      duplicateSkipped: signals.filter((s) => s.status === 'SKIPPED_DUPLICATE')
        .length,
      rejectedRisk: signals.filter((s) => s.status === 'REJECTED_RISK').length,
      failed: signals.filter((s) => s.status === 'FAILED').length,
    };

    return {
      runId: run.id,
      strategy: run.strategy,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      notes: run.notes,
      summary,
    };
  }

  async listRunSignals(runId: string): Promise<AutomationSignalExecutionItem[]> {
    const run = await this.automationRepository.findRun(runId);
    if (!run) {
      throw new NotFoundException(`Automation run not found: ${runId}`);
    }

    const rows = await this.automationRepository.listRunSignalExecutions(runId);
    return rows.map((row) => ({
      executionId: row.id,
      signalKey: row.signalKey,
      symbol: row.symbol,
      side: row.side,
      status: row.status,
      reason: row.reason,
      orderId: row.orderId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private toSignalKey(strategy: string, signal: AutomationSignalInput): string {
    const timestamp = signal.signalAt.toISOString();
    return `${strategy}|${signal.symbol}|${signal.side}|${timestamp}`;
  }

  private async placeOrderFromSignal(
    signal: AutomationSignalInput,
  ): Promise<PlaceMarketOrderResult> {
    return this.paperTradingService.placeMarketOrder({
      symbol: signal.symbol,
      side: signal.side,
      quantity: signal.quantity,
    });
  }
}
