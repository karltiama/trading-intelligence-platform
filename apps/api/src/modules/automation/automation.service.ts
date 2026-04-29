import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaperOrderSide, TradeSource } from '@prisma/client';
import {
  PaperTradingService,
  type PlaceMarketOrderResult,
} from '../paper-trading/paper-trading.service';
import { PaperTradingRepository } from '../paper-trading/paper-trading.repository';
import { RiskService } from '../risk/risk.service';
import { AuditService } from '../audit/audit.service';
import {
  AutomationRepository,
  type AutomationRunListFilters,
} from './automation.repository';
import { buildDeterministicSignalKey } from './deterministic-signal-key';

export type AutomationSignalInput = {
  symbolId: string;
  symbol: string;
  side: PaperOrderSide;
  signalAt: Date;
  quantity: number;
};

export type AutomationRunResult = {
  userEmail: string;
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
  userEmail: string;
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

export type AutomationRunPage = {
  items: AutomationRunListItem[];
  nextCursor: string | null;
  limit: number;
};

export type AutomationSignalExecutionItem = {
  userEmail: string;
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

export type AutomationGuardrail = {
  userEmail: string;
  strategy: string;
  enabled: boolean;
  cooldownSeconds: number;
  lastTriggeredAt: string | null;
  updatedAt: string;
};

@Injectable()
export class AutomationService {
  constructor(
    private readonly automationRepository: AutomationRepository,
    private readonly paperTradingService: PaperTradingService,
    private readonly paperTradingRepository: PaperTradingRepository,
    private readonly riskService: RiskService,
    private readonly auditService: AuditService,
  ) {}

  async executeRun(params: {
    strategy: string;
    signals: AutomationSignalInput[];
    userEmail: string;
    accountId?: string;
  }): Promise<AutomationRunResult> {
    if (params.accountId) {
      await this.ensureOwnedAccount(params.userEmail, params.accountId);
    }
    const strategy = params.strategy.trim();
    if (!strategy) {
      throw new BadRequestException('strategy is required.');
    }

    const userEmail = params.userEmail;
    const guardrail = await this.automationRepository.getOrCreateGuardrail(
      userEmail,
      strategy,
    );
    this.assertGuardrailAllowsRun(guardrail);

    const triggeredAt = new Date();
    await this.automationRepository.touchGuardrailTriggered({
      userEmail,
      strategy,
      triggeredAt,
    });
    const run = await this.automationRepository.createAutomationRun({
      strategy,
      userEmail,
    });
    await this.auditService.recordEvent({
      eventType: 'AUTOMATION_RUN_STARTED',
      userEmail,
      accountId: params.accountId,
      resourceId: run.id,
      payload: {
        strategy,
        totalSignals: params.signals.length,
      },
    });
    let placed = 0;
    let duplicateSkipped = 0;
    let rejectedRisk = 0;
    let failed = 0;

    for (const signal of params.signals) {
      const signalKey = buildDeterministicSignalKey({
        strategy,
        symbol: signal.symbol,
        side: signal.side,
        signalAt: signal.signalAt,
      });

      const execution =
        await this.automationRepository.createSignalExecutionAttempt({
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
        userEmail,
        accountId: params.accountId,
      });
      if (!risk.allowed) {
        rejectedRisk += 1;
        await this.automationRepository.markSignalExecutionRejected({
          executionId: execution.id,
          reason: risk.reason,
        });
        await this.auditService.recordEvent({
          eventType: 'AUTOMATION_SIGNAL_REJECTED_RISK',
          userEmail,
          accountId: params.accountId,
          resourceId: execution.id,
          payload: {
            runId: run.id,
            strategy,
            symbol: signal.symbol,
            side: signal.side,
            quantity: signal.quantity,
            reason: risk.reason,
          },
        });
        continue;
      }

      try {
        const order = await this.placeOrderFromSignal(
          signal,
          userEmail,
          params.accountId,
        );
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
    await this.automationRepository.completeAutomationRun({
      runId: run.id,
      status,
      notes: `placed=${placed};duplicateSkipped=${duplicateSkipped};rejectedRisk=${rejectedRisk};failed=${failed}`,
    });
    await this.auditService.recordEvent({
      eventType: 'AUTOMATION_RUN_COMPLETED',
      userEmail,
      accountId: params.accountId,
      resourceId: run.id,
      payload: {
        strategy,
        status,
        placed,
        duplicateSkipped,
        rejectedRisk,
        failed,
      },
    });

    return {
      userEmail,
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
    userEmail: string;
    accountId?: string;
  }): Promise<AutomationRunResult> {
    return this.executeRun(params);
  }

  async listRuns(
    userEmail: string,
    filters: AutomationRunListFilters = {},
    accountId?: string,
  ): Promise<AutomationRunListItem[]> {
    if (accountId) {
      await this.ensureOwnedAccount(userEmail, accountId);
    }
    const rows = await this.automationRepository.listRuns(userEmail, filters);
    return rows.map((row) => ({
      userEmail,
      runId: row.id,
      strategy: row.strategy,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      notes: row.notes,
    }));
  }

  async listRunsPage(input: {
    userEmail: string;
    accountId?: string;
    strategy?: string;
    status?: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
    limit: number;
    cursor?: string;
  }): Promise<AutomationRunPage> {
    if (input.accountId) {
      await this.ensureOwnedAccount(input.userEmail, input.accountId);
    }
    const cursor = this.decodeRunsCursor(input.cursor);
    const rows = await this.automationRepository.listRuns(input.userEmail, {
      strategy: input.strategy,
      status: input.status,
      limit: input.limit + 1,
      cursorStartedAt: cursor?.startedAt,
      cursorRunId: cursor?.runId,
    });
    const hasMore = rows.length > input.limit;
    const visibleRows = hasMore ? rows.slice(0, input.limit) : rows;
    const items = visibleRows.map((row) => ({
      userEmail: input.userEmail,
      runId: row.id,
      strategy: row.strategy,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      notes: row.notes,
    }));
    const last = visibleRows[visibleRows.length - 1];
    const nextCursor =
      hasMore && last
        ? this.encodeRunsCursor({
            startedAt: last.startedAt.toISOString(),
            runId: last.id,
          })
        : null;
    return { items, nextCursor, limit: input.limit };
  }

  async getRunDetails(
    runId: string,
    userEmail: string,
    accountId?: string,
  ): Promise<AutomationRunDetails> {
    if (accountId) {
      await this.ensureOwnedAccount(userEmail, accountId);
    }
    const run = await this.automationRepository.findRun(runId, userEmail);
    if (!run) {
      throw new NotFoundException(`Automation run not found: ${runId}`);
    }

    const signals =
      await this.automationRepository.listRunSignalExecutions(runId);
    const summary = {
      totalSignals: signals.length,
      placed: signals.filter((s) => s.status === 'PLACED').length,
      duplicateSkipped: signals.filter((s) => s.status === 'SKIPPED_DUPLICATE')
        .length,
      rejectedRisk: signals.filter((s) => s.status === 'REJECTED_RISK').length,
      failed: signals.filter((s) => s.status === 'FAILED').length,
    };

    return {
      userEmail,
      runId: run.id,
      strategy: run.strategy,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      notes: run.notes,
      summary,
    };
  }

  async listRunSignals(
    runId: string,
    userEmail: string,
    accountId?: string,
  ): Promise<AutomationSignalExecutionItem[]> {
    if (accountId) {
      await this.ensureOwnedAccount(userEmail, accountId);
    }
    const run = await this.automationRepository.findRun(runId, userEmail);
    if (!run) {
      throw new NotFoundException(`Automation run not found: ${runId}`);
    }

    const rows = await this.automationRepository.listRunSignalExecutions(runId);
    return rows.map((row) => ({
      userEmail,
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

  async getGuardrail(
    userEmail: string,
    strategy: string,
  ): Promise<AutomationGuardrail> {
    const normalizedStrategy = strategy.trim();
    if (!normalizedStrategy) {
      throw new BadRequestException('strategy is required.');
    }
    const row = await this.automationRepository.getOrCreateGuardrail(
      userEmail,
      normalizedStrategy,
    );
    return {
      userEmail: row.userEmail,
      strategy: row.strategy,
      enabled: row.enabled,
      cooldownSeconds: row.cooldownSeconds,
      lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateGuardrail(input: {
    userEmail: string;
    strategy: string;
    enabled?: boolean;
    cooldownSeconds?: number;
  }): Promise<AutomationGuardrail> {
    const normalizedStrategy = input.strategy.trim();
    if (!normalizedStrategy) {
      throw new BadRequestException('strategy is required.');
    }
    if (
      input.cooldownSeconds !== undefined &&
      (!Number.isInteger(input.cooldownSeconds) || input.cooldownSeconds < 0)
    ) {
      throw new BadRequestException('cooldownSeconds must be an integer >= 0.');
    }
    const row = await this.automationRepository.updateGuardrail({
      userEmail: input.userEmail,
      strategy: normalizedStrategy,
      enabled: input.enabled,
      cooldownSeconds: input.cooldownSeconds,
    });
    return {
      userEmail: row.userEmail,
      strategy: row.strategy,
      enabled: row.enabled,
      cooldownSeconds: row.cooldownSeconds,
      lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async placeOrderFromSignal(
    signal: AutomationSignalInput,
    userEmail: string,
    accountId?: string,
  ): Promise<PlaceMarketOrderResult> {
    return this.paperTradingService.placeMarketOrder(
      {
        symbol: signal.symbol,
        side: signal.side,
        quantity: signal.quantity,
        source: TradeSource.AUTOMATION,
      },
      userEmail,
      accountId,
    );
  }

  private async ensureOwnedAccount(
    userEmail: string,
    accountId: string,
  ): Promise<void> {
    const account = await this.paperTradingRepository.resolveAccountForUser({
      userEmail,
      accountId,
    });
    if (!account) {
      throw new NotFoundException(
        `Paper account not found for current user: ${accountId}`,
      );
    }
  }

  private assertGuardrailAllowsRun(input: {
    enabled: boolean;
    cooldownSeconds: number;
    lastTriggeredAt: Date | null;
    strategy: string;
  }): void {
    if (!input.enabled) {
      throw new ConflictException(
        `Automation strategy is disabled: ${input.strategy}`,
      );
    }
    if (input.cooldownSeconds <= 0 || !input.lastTriggeredAt) {
      return;
    }
    const elapsedSeconds = Math.floor(
      (Date.now() - input.lastTriggeredAt.getTime()) / 1000,
    );
    const remaining = input.cooldownSeconds - elapsedSeconds;
    if (remaining > 0) {
      throw new ConflictException(
        `Automation strategy cooldown active: ${remaining}s remaining.`,
      );
    }
  }

  private encodeRunsCursor(input: {
    startedAt: string;
    runId: string;
  }): string {
    return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
  }

  private decodeRunsCursor(
    raw?: string,
  ): { startedAt: Date; runId: string } | undefined {
    if (!raw) {
      return undefined;
    }
    try {
      const decoded = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      ) as { startedAt?: string; runId?: string };
      if (!decoded.startedAt || !decoded.runId) {
        throw new BadRequestException('invalid cursor.');
      }
      const startedAt = new Date(decoded.startedAt);
      if (Number.isNaN(startedAt.getTime())) {
        throw new BadRequestException('invalid cursor.');
      }
      return { startedAt, runId: decoded.runId };
    } catch {
      throw new BadRequestException('invalid cursor.');
    }
  }
}
