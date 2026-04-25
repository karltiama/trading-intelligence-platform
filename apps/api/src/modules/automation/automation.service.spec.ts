import { BadRequestException } from '@nestjs/common';
import { AutomationRepository } from './automation.repository';
import {
  AutomationService,
  type AutomationSignalInput,
} from './automation.service';
import { PaperTradingService } from '../paper-trading/paper-trading.service';
import { RiskService } from '../risk/risk.service';

describe('AutomationService', () => {
  const automationRepository = {
    createRun: jest.fn(),
    completeRun: jest.fn(),
    createSignalExecution: jest.fn(),
    markSignalExecutionPlaced: jest.fn(),
    markSignalExecutionRejectedRisk: jest.fn(),
    markSignalExecutionFailed: jest.fn(),
  } as unknown as AutomationRepository;

  const paperTradingService = {
    placeMarketOrder: jest.fn(),
  } as unknown as PaperTradingService;

  const riskService = {
    evaluateOrder: jest.fn(),
  } as unknown as RiskService;

  const service = new AutomationService(
    automationRepository,
    paperTradingService,
    riskService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (automationRepository.createRun as jest.Mock).mockResolvedValue({
      id: 'run-1',
      strategy: 'mean-reversion',
      status: 'RUNNING',
      startedAt: new Date('2026-04-25T00:00:00.000Z'),
    });
    (automationRepository.completeRun as jest.Mock).mockResolvedValue(undefined);
    (automationRepository.markSignalExecutionPlaced as jest.Mock).mockResolvedValue(
      undefined,
    );
    (automationRepository.markSignalExecutionRejectedRisk as jest.Mock).mockResolvedValue(
      undefined,
    );
    (automationRepository.markSignalExecutionFailed as jest.Mock).mockResolvedValue(
      undefined,
    );
    (riskService.evaluateOrder as jest.Mock).mockResolvedValue({
      allowed: true,
    });
  });

  it('skips duplicate signal in same run and places only one order', async () => {
    const signalAt = new Date('2026-04-25T12:00:00.000Z');
    const signals: AutomationSignalInput[] = [
      {
        symbolId: 'sym-1',
        symbol: 'AAPL',
        side: 'BUY',
        signalAt,
        quantity: 1,
      },
      {
        symbolId: 'sym-1',
        symbol: 'AAPL',
        side: 'BUY',
        signalAt,
        quantity: 1,
      },
    ];

    (automationRepository.createSignalExecution as jest.Mock)
      .mockResolvedValueOnce({ id: 'exec-1' })
      .mockResolvedValueOnce(null);

    (paperTradingService.placeMarketOrder as jest.Mock).mockResolvedValue({
      orderId: 'ord-1',
      status: 'FILLED',
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 1,
      fillPrice: 100,
      fillNotional: 100,
      cashBalance: 99900,
    });

    const result = await service.executeRun({
      strategy: 'mean-reversion',
      signals,
    });

    expect(result.placed).toBe(1);
    expect(result.duplicateSkipped).toBe(1);
    expect(result.rejectedRisk).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.status).toBe('SUCCESS');
    expect(paperTradingService.placeMarketOrder).toHaveBeenCalledTimes(1);
    expect(automationRepository.markSignalExecutionPlaced).toHaveBeenCalledTimes(1);
  });

  it('marks run failed when order placement fails for a signal', async () => {
    const signals: AutomationSignalInput[] = [
      {
        symbolId: 'sym-1',
        symbol: 'MSFT',
        side: 'BUY',
        signalAt: new Date('2026-04-25T12:05:00.000Z'),
        quantity: 1,
      },
    ];

    (automationRepository.createSignalExecution as jest.Mock).mockResolvedValue({
      id: 'exec-1',
    });
    (paperTradingService.placeMarketOrder as jest.Mock).mockRejectedValue(
      new Error('Insufficient cash'),
    );

    const result = await service.executeRun({
      strategy: 'breakout',
      signals,
    });

    expect(result.placed).toBe(0);
    expect(result.rejectedRisk).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.status).toBe('FAILED');
    expect(automationRepository.markSignalExecutionFailed).toHaveBeenCalledTimes(1);
    expect(automationRepository.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        status: 'FAILED',
      }),
    );
  });

  it('rejects blank strategy', async () => {
    await expect(
      service.executeRun({
        strategy: '   ',
        signals: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks risk-rejected signal without placing order', async () => {
    const signals: AutomationSignalInput[] = [
      {
        symbolId: 'sym-1',
        symbol: 'TSLA',
        side: 'BUY',
        signalAt: new Date('2026-04-25T12:10:00.000Z'),
        quantity: 5000,
      },
    ];

    (automationRepository.createSignalExecution as jest.Mock).mockResolvedValue({
      id: 'exec-1',
    });
    (riskService.evaluateOrder as jest.Mock).mockResolvedValue({
      allowed: false,
      reason: 'quantity exceeds max per order',
    });

    const result = await service.executeRun({
      strategy: 'risk-test',
      signals,
    });

    expect(result.placed).toBe(0);
    expect(result.duplicateSkipped).toBe(0);
    expect(result.rejectedRisk).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.status).toBe('SUCCESS');
    expect(paperTradingService.placeMarketOrder).not.toHaveBeenCalled();
    expect(
      automationRepository.markSignalExecutionRejectedRisk,
    ).toHaveBeenCalledTimes(1);
  });
});
