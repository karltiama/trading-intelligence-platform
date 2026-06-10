import { Prisma, TradeSource } from '@prisma/client';
import { MarketDataRepository } from '../market-data/market-data.repository';
import { MarketDataService } from '../market-data/market-data.service';
import { PaperTradingRepository } from '../paper-trading/paper-trading.repository';
import { PaperTradingService } from '../paper-trading/paper-trading.service';
import { PositionManagementService } from './position-management.service';

describe('PositionManagementService', () => {
  const paperTradingRepository = {
    listAccountsWithOpenPositions: jest.fn(),
    listPositions: jest.fn(),
    findLatestFilledBuyOrdersForSymbols: jest.fn(),
    resolveAccountForUser: jest.fn(),
    findSymbolQuote: jest.fn(),
    findPosition: jest.fn(),
  } as unknown as PaperTradingRepository;

  const paperTradingService = {
    placeMarketOrder: jest.fn(),
  } as unknown as PaperTradingService;

  const marketDataService = {
    ensureHourlyBarsForSymbols: jest.fn(),
  } as unknown as MarketDataService;

  const marketDataRepository = {
    findLatestMarkPricesForSymbols: jest.fn(),
  } as unknown as MarketDataRepository;

  const service = new PositionManagementService(
    paperTradingRepository,
    paperTradingService,
    marketDataService,
    marketDataRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (marketDataService.ensureHourlyBarsForSymbols as jest.Mock).mockResolvedValue(
      undefined,
    );
  });

  it('auto-sells when mark price hits stop loss', async () => {
    (paperTradingRepository.listAccountsWithOpenPositions as jest.Mock).mockResolvedValue(
      [{ accountId: 'acct-1', userEmail: 'trader@local.test' }],
    );
    (paperTradingRepository.listPositions as jest.Mock).mockResolvedValue([
      {
        symbolId: 'sym-1',
        symbol: 'AAPL',
        quantity: new Prisma.Decimal(2),
      },
    ]);
    (marketDataRepository.findLatestMarkPricesForSymbols as jest.Mock).mockResolvedValue(
      {
        'sym-1': {
          close: new Prisma.Decimal(94),
          asOf: new Date('2026-04-26T15:00:00.000Z'),
          source: 'H1',
        },
      },
    );
    (paperTradingRepository.findLatestFilledBuyOrdersForSymbols as jest.Mock).mockResolvedValue(
      {
        'sym-1': {
          orderId: 'ord-1',
          stopLossPrice: 95,
          takeProfitPrice: 110,
        },
      },
    );
    (paperTradingService.placeMarketOrder as jest.Mock).mockResolvedValue({
      orderId: 'sell-1',
      status: 'FILLED',
      fillPrice: 94,
      cashBalance: 1000,
    });

    const result = await service.monitorOpenPositions({ force: true });

    expect(result.exited).toHaveLength(1);
    expect(result.exited[0]).toMatchObject({
      symbol: 'AAPL',
      reason: 'STOP_LOSS',
      quantity: 2,
      orderId: 'sell-1',
    });
    expect(paperTradingService.placeMarketOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'AAPL',
        side: 'SELL',
        quantity: 2,
        source: TradeSource.MANUAL,
      }),
      'trader@local.test',
      'acct-1',
    );
  });

  it('closes a full position when quantity is omitted', async () => {
    (paperTradingRepository.resolveAccountForUser as jest.Mock).mockResolvedValue(
      { id: 'acct-1' },
    );
    (paperTradingRepository.findSymbolQuote as jest.Mock).mockResolvedValue({
      symbolId: 'sym-1',
      ticker: 'AAPL',
      latestClose: new Prisma.Decimal(100),
    });
    (paperTradingRepository.findPosition as jest.Mock).mockResolvedValue({
      quantity: new Prisma.Decimal(3),
    });
    (paperTradingService.placeMarketOrder as jest.Mock).mockResolvedValue({
      orderId: 'sell-2',
      status: 'FILLED',
      fillPrice: 100,
      cashBalance: 2000,
    });

    const result = await service.closePosition('trader@local.test', 'AAPL');

    expect(result.quantity).toBe(3);
    expect(paperTradingService.placeMarketOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        side: 'SELL',
        quantity: 3,
      }),
      'trader@local.test',
      'acct-1',
    );
  });
});
