import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TradeSource } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PaperTradingRepository } from './paper-trading.repository';
import { PaperTradingService } from './paper-trading.service';

describe('PaperTradingService', () => {
  const repository = {
    resolveAccountForUser: jest.fn(),
    findSymbolQuote: jest.fn(),
    findSignalSymbolLink: jest.fn(),
    findPosition: jest.fn(),
    createFilledOrder: jest.fn(),
    updateAccountCash: jest.fn(),
    upsertPosition: jest.fn(),
    findOrderForAccount: jest.fn(),
    cancelNewOrderForAccount: jest.fn(),
  } as unknown as PaperTradingRepository;

  const auditService = {
    recordEvent: jest.fn(),
  } as unknown as AuditService;

  const marketDataService = {
    resolveSymbolMarkPrice: jest.fn(),
  } as unknown as import('../market-data/market-data.service').MarketDataService;

  const service = new PaperTradingService(
    repository,
    auditService,
    marketDataService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (auditService.recordEvent as jest.Mock).mockResolvedValue(undefined);
    (marketDataService.resolveSymbolMarkPrice as jest.Mock).mockResolvedValue({
      symbolId: 'sym-1',
      ticker: 'AAPL',
      close: 100,
      asOf: new Date('2026-04-25T00:00:00.000Z'),
      source: 'D1',
    });
  });

  it('fills a BUY market order immediately and updates cash', async () => {
    (repository.resolveAccountForUser as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(1000),
      currency: 'USD',
    });
    (repository.findSymbolQuote as jest.Mock).mockResolvedValue({
      symbolId: 'sym-1',
      ticker: 'AAPL',
      latestClose: new Prisma.Decimal(100),
    });
    (repository.findPosition as jest.Mock).mockResolvedValue(null);
    (repository.createFilledOrder as jest.Mock).mockResolvedValue({
      orderId: 'ord-1',
      filledAt: new Date(),
    });
    (repository.updateAccountCash as jest.Mock).mockResolvedValue(undefined);
    (repository.upsertPosition as jest.Mock).mockResolvedValue(undefined);

    const result = await service.placeMarketOrder(
      {
        symbol: 'aapl',
        side: 'BUY',
        quantity: 5,
        source: TradeSource.MANUAL,
      },
      'paper-spec@local.test',
    );

    expect(result.status).toBe('FILLED');
    expect(result.fillPrice).toBe(100);
    expect(result.fillNotional).toBe(500);
    expect(result.cashBalance).toBe(500);
    expect(result.signalId).toBeNull();
    expect(result.source).toBe(TradeSource.MANUAL);
    expect(result.note).toBeNull();
    expect(repository.findSignalSymbolLink).not.toHaveBeenCalled();
    expect(repository.createFilledOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        source: TradeSource.MANUAL,
        signalId: null,
      }),
    );
  });

  it('rejects BUY when cash is insufficient', async () => {
    (repository.resolveAccountForUser as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(100),
      currency: 'USD',
    });
    (repository.findSymbolQuote as jest.Mock).mockResolvedValue({
      symbolId: 'sym-1',
      ticker: 'AAPL',
      latestClose: new Prisma.Decimal(100),
    });
    (repository.findPosition as jest.Mock).mockResolvedValue(null);

    await expect(
      service.placeMarketOrder(
        {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 2,
          source: TradeSource.MANUAL,
        },
        'paper-spec@local.test',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects SELL when position quantity is missing (shorting disabled)', async () => {
    (repository.resolveAccountForUser as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(1000),
      currency: 'USD',
    });
    (repository.findSymbolQuote as jest.Mock).mockResolvedValue({
      symbolId: 'sym-1',
      ticker: 'AAPL',
      latestClose: new Prisma.Decimal(100),
    });
    (repository.findPosition as jest.Mock).mockResolvedValue(null);

    await expect(
      service.placeMarketOrder(
        {
          symbol: 'AAPL',
          side: 'SELL',
          quantity: 1,
          source: TradeSource.MANUAL,
        },
        'paper-spec@local.test',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects unknown symbol lookup', async () => {
    (repository.resolveAccountForUser as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(1000),
      currency: 'USD',
    });
    (repository.findSymbolQuote as jest.Mock).mockResolvedValue(null);

    await expect(
      service.placeMarketOrder(
        {
          symbol: 'NOPE',
          side: 'BUY',
          quantity: 1,
          source: TradeSource.MANUAL,
        },
        'paper-spec@local.test',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects cancel when order is already filled', async () => {
    (repository.resolveAccountForUser as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(1000),
      currency: 'USD',
    });
    (repository.findOrderForAccount as jest.Mock).mockResolvedValue({
      id: 'ord-1',
      status: 'FILLED',
      brokerOrderId: null,
    });

    await expect(
      service.cancelOrder('ord-1', 'paper-spec@local.test'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects invalid quantity input', async () => {
    await expect(
      service.placeMarketOrder(
        {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 0,
          source: TradeSource.MANUAL,
        },
        'paper-spec@local.test',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects MANUAL orders that include signalId', async () => {
    (repository.resolveAccountForUser as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(1000),
      currency: 'USD',
    });
    (repository.findSymbolQuote as jest.Mock).mockResolvedValue({
      symbolId: 'sym-1',
      ticker: 'AAPL',
      latestClose: new Prisma.Decimal(100),
    });

    await expect(
      service.placeMarketOrder(
        {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          source: TradeSource.MANUAL,
          signalId: 'sig-1',
        },
        'paper-spec@local.test',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createFilledOrder).not.toHaveBeenCalled();
  });

  it('rejects SIGNAL when signal symbol does not match order symbol', async () => {
    (repository.resolveAccountForUser as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(1000),
      currency: 'USD',
    });
    (repository.findSymbolQuote as jest.Mock).mockResolvedValue({
      symbolId: 'sym-1',
      ticker: 'AAPL',
      latestClose: new Prisma.Decimal(100),
    });
    (repository.findSignalSymbolLink as jest.Mock).mockResolvedValue({
      id: 'sig-msft',
      symbolId: 'sym-msft',
    });

    await expect(
      service.placeMarketOrder(
        {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          source: TradeSource.SIGNAL,
          signalId: 'sig-msft',
        },
        'paper-spec@local.test',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createFilledOrder).not.toHaveBeenCalled();
  });

  it('persists signalId and SIGNAL source on filled buy when signal matches symbol', async () => {
    (repository.resolveAccountForUser as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(1000),
      currency: 'USD',
    });
    (repository.findSymbolQuote as jest.Mock).mockResolvedValue({
      symbolId: 'sym-1',
      ticker: 'AAPL',
      latestClose: new Prisma.Decimal(100),
    });
    (repository.findSignalSymbolLink as jest.Mock).mockResolvedValue({
      id: 'sig-1',
      symbolId: 'sym-1',
    });
    (repository.findPosition as jest.Mock).mockResolvedValue(null);
    (repository.createFilledOrder as jest.Mock).mockResolvedValue({
      orderId: 'ord-1',
      filledAt: new Date(),
    });
    (repository.updateAccountCash as jest.Mock).mockResolvedValue(undefined);
    (repository.upsertPosition as jest.Mock).mockResolvedValue(undefined);

    const result = await service.placeMarketOrder(
      {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 1,
        source: TradeSource.SIGNAL,
        signalId: 'sig-1',
        note: '  test note  ',
      },
      'paper-spec@local.test',
    );

    expect(result.signalId).toBe('sig-1');
    expect(result.source).toBe(TradeSource.SIGNAL);
    expect(result.note).toBe('test note');
    expect(repository.createFilledOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        signalId: 'sig-1',
        symbolId: 'sym-1',
        source: TradeSource.SIGNAL,
        note: 'test note',
      }),
    );
  });

  it('records AUTOMATION source without signal link', async () => {
    (repository.resolveAccountForUser as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(1000),
      currency: 'USD',
    });
    (repository.findSymbolQuote as jest.Mock).mockResolvedValue({
      symbolId: 'sym-1',
      ticker: 'AAPL',
      latestClose: new Prisma.Decimal(100),
    });
    (repository.findPosition as jest.Mock).mockResolvedValue(null);
    (repository.createFilledOrder as jest.Mock).mockResolvedValue({
      orderId: 'ord-1',
      filledAt: new Date(),
    });
    (repository.updateAccountCash as jest.Mock).mockResolvedValue(undefined);
    (repository.upsertPosition as jest.Mock).mockResolvedValue(undefined);

    const result = await service.placeMarketOrder(
      {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 1,
        source: TradeSource.AUTOMATION,
      },
      'paper-spec@local.test',
    );

    expect(result.source).toBe(TradeSource.AUTOMATION);
    expect(result.signalId).toBeNull();
    expect(repository.findSignalSymbolLink).not.toHaveBeenCalled();
    expect(repository.createFilledOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        source: TradeSource.AUTOMATION,
        signalId: null,
      }),
    );
  });

  it('links AUTOMATION orders to scanner signal when signalId is provided', async () => {
    (repository.resolveAccountForUser as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(1000),
      currency: 'USD',
    });
    (repository.findSymbolQuote as jest.Mock).mockResolvedValue({
      symbolId: 'sym-1',
      ticker: 'AAPL',
      latestClose: new Prisma.Decimal(100),
    });
    (repository.findSignalSymbolLink as jest.Mock).mockResolvedValue({
      id: 'sig-1',
      symbolId: 'sym-1',
    });
    (repository.findPosition as jest.Mock).mockResolvedValue(null);
    (repository.createFilledOrder as jest.Mock).mockResolvedValue({
      orderId: 'ord-1',
      filledAt: new Date(),
    });
    (repository.updateAccountCash as jest.Mock).mockResolvedValue(undefined);
    (repository.upsertPosition as jest.Mock).mockResolvedValue(undefined);

    const result = await service.placeMarketOrder(
      {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 1,
        source: TradeSource.AUTOMATION,
        signalId: 'sig-1',
        note: '[TREND_PULLBACK] confidence=85 Strong setup.',
      },
      'paper-spec@local.test',
    );

    expect(result.signalId).toBe('sig-1');
    expect(result.note).toContain('TREND_PULLBACK');
    expect(repository.createFilledOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        source: TradeSource.AUTOMATION,
        signalId: 'sig-1',
        note: '[TREND_PULLBACK] confidence=85 Strong setup.',
      }),
    );
  });
});
