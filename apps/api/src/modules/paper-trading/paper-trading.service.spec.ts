import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  const service = new PaperTradingService(repository, auditService);

  beforeEach(() => {
    jest.clearAllMocks();
    (auditService.recordEvent as jest.Mock).mockResolvedValue(undefined);
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
    (repository.findSignalSymbolLink as jest.Mock).mockResolvedValue(null);
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
      },
      'paper-spec@local.test',
    );

    expect(result.status).toBe('FILLED');
    expect(result.fillPrice).toBe(100);
    expect(result.fillNotional).toBe(500);
    expect(result.cashBalance).toBe(500);
    expect(result.signalId).toBeNull();
    expect(repository.findSignalSymbolLink).not.toHaveBeenCalled();
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
    (repository.findSignalSymbolLink as jest.Mock).mockResolvedValue(null);
    (repository.findPosition as jest.Mock).mockResolvedValue(null);

    await expect(
      service.placeMarketOrder({
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 2,
      }, 'paper-spec@local.test'),
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
    (repository.findSignalSymbolLink as jest.Mock).mockResolvedValue(null);
    (repository.findPosition as jest.Mock).mockResolvedValue(null);

    await expect(
      service.placeMarketOrder({
        symbol: 'AAPL',
        side: 'SELL',
        quantity: 1,
      }, 'paper-spec@local.test'),
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
    (repository.findSignalSymbolLink as jest.Mock).mockResolvedValue(null);

    await expect(
      service.placeMarketOrder({
        symbol: 'NOPE',
        side: 'BUY',
        quantity: 1,
      }, 'paper-spec@local.test'),
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
    });

    await expect(
      service.cancelOrder('ord-1', 'paper-spec@local.test'),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects invalid quantity input', async () => {
    await expect(
      service.placeMarketOrder({
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 0,
      }, 'paper-spec@local.test'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects signalId when signal symbol does not match order symbol', async () => {
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
          signalId: 'sig-msft',
        },
        'paper-spec@local.test',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createFilledOrder).not.toHaveBeenCalled();
  });

  it('persists signalId on filled buy when signal matches symbol', async () => {
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
        signalId: 'sig-1',
      },
      'paper-spec@local.test',
    );

    expect(result.signalId).toBe('sig-1');
    expect(repository.createFilledOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        signalId: 'sig-1',
        symbolId: 'sym-1',
      }),
    );
  });
});
