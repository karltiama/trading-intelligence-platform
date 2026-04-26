import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaperTradingRepository } from './paper-trading.repository';
import { PaperTradingService } from './paper-trading.service';

describe('PaperTradingService', () => {
  const repository = {
    getOrCreateAccountForUserEmail: jest.fn(),
    findSymbolQuote: jest.fn(),
    findPosition: jest.fn(),
    createFilledOrder: jest.fn(),
    updateAccountCash: jest.fn(),
    upsertPosition: jest.fn(),
    findOrderForAccount: jest.fn(),
    cancelNewOrderForAccount: jest.fn(),
  } as unknown as PaperTradingRepository;

  const service = new PaperTradingService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fills a BUY market order immediately and updates cash', async () => {
    (repository.getOrCreateAccountForUserEmail as jest.Mock).mockResolvedValue({
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

    const result = await service.placeMarketOrder({
      symbol: 'aapl',
      side: 'BUY',
      quantity: 5,
    });

    expect(result.status).toBe('FILLED');
    expect(result.fillPrice).toBe(100);
    expect(result.fillNotional).toBe(500);
    expect(result.cashBalance).toBe(500);
  });

  it('rejects BUY when cash is insufficient', async () => {
    (repository.getOrCreateAccountForUserEmail as jest.Mock).mockResolvedValue({
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
      service.placeMarketOrder({
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects SELL when position quantity is missing (shorting disabled)', async () => {
    (repository.getOrCreateAccountForUserEmail as jest.Mock).mockResolvedValue({
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
      service.placeMarketOrder({
        symbol: 'AAPL',
        side: 'SELL',
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects unknown symbol lookup', async () => {
    (repository.getOrCreateAccountForUserEmail as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(1000),
      currency: 'USD',
    });
    (repository.findSymbolQuote as jest.Mock).mockResolvedValue(null);

    await expect(
      service.placeMarketOrder({
        symbol: 'NOPE',
        side: 'BUY',
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects cancel when order is already filled', async () => {
    (repository.getOrCreateAccountForUserEmail as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      startingCash: new Prisma.Decimal(100000),
      cashBalance: new Prisma.Decimal(1000),
      currency: 'USD',
    });
    (repository.findOrderForAccount as jest.Mock).mockResolvedValue({
      id: 'ord-1',
      status: 'FILLED',
    });

    await expect(service.cancelOrder('ord-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects invalid quantity input', async () => {
    await expect(
      service.placeMarketOrder({
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
