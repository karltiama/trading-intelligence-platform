import { MarketDataRepository } from '../market-data/market-data.repository';
import { MarketDataService } from '../market-data/market-data.service';
import { PaperTradingRepository } from '../paper-trading/paper-trading.repository';
import { PaperTradingService } from '../paper-trading/paper-trading.service';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const paperTradingService = {
    placeMarketOrder: jest.fn(),
    listOrders: jest.fn(),
    listOrdersPage: jest.fn(),
    cancelOrder: jest.fn(),
    updateOrderLevels: jest.fn(),
  } as unknown as PaperTradingService;

  const marketDataService = {
    getBars: jest.fn(),
    syncDailyBars: jest.fn(),
  } as unknown as MarketDataService;

  const marketDataRepository = {
    findSymbolByTicker: jest.fn(),
    createTrackedSymbol: jest.fn(),
    touchSymbolLastSeenAt: jest.fn(),
  } as unknown as MarketDataRepository;

  const paperTradingRepository = {
    findSymbolQuote: jest.fn(),
    resolveAccountForUser: jest.fn(),
  } as unknown as PaperTradingRepository;

  const service = new OrdersService(
    paperTradingService,
    marketDataService,
    marketDataRepository,
    paperTradingRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (paperTradingService.placeMarketOrder as jest.Mock).mockResolvedValue({
      orderId: 'ord-1',
      status: 'FILLED',
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 1,
      fillPrice: 100,
      fillNotional: 100,
      cashBalance: 99900,
      signalId: null,
      source: 'MANUAL',
      note: null,
      stopLossPrice: null,
      takeProfitPrice: null,
    });
    (marketDataService.getBars as jest.Mock).mockResolvedValue([]);
    (marketDataService.syncDailyBars as jest.Mock).mockResolvedValue(1);
    (marketDataRepository.touchSymbolLastSeenAt as jest.Mock).mockResolvedValue(
      undefined,
    );
    (paperTradingRepository.findSymbolQuote as jest.Mock).mockResolvedValue({
      symbolId: 'sym-1',
      ticker: 'AAPL',
      latestClose: { toNumber: () => 100 },
    });
    (
      paperTradingRepository.resolveAccountForUser as jest.Mock
    ).mockResolvedValue({
      id: 'acct-1',
      cashBalance: { toNumber: () => 100000 },
    });
  });

  it('rejects unknown ticker for manual order', async () => {
    (marketDataRepository.findSymbolByTicker as jest.Mock).mockResolvedValue(
      null,
    );

    await expect(
      service.placeOrder(
        {
          symbol: 'aapl',
          side: 'BUY',
          quantity: 1,
          stopLossPrice: 99,
          source: 'MANUAL',
        },
        'orders-test@local.test',
      ),
    ).rejects.toThrow('is not tracked');
    expect(marketDataService.syncDailyBars).not.toHaveBeenCalled();
    expect(marketDataRepository.touchSymbolLastSeenAt).not.toHaveBeenCalled();
  });

  it('rejects BUY without stop loss', async () => {
    (marketDataRepository.findSymbolByTicker as jest.Mock).mockResolvedValue({
      id: 'sym-1',
      ticker: 'AAPL',
      isActive: true,
    });
    await expect(
      service.placeOrder(
        {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 1,
          source: 'MANUAL',
        },
        'orders-test@local.test',
      ),
    ).rejects.toThrow('stopLossPrice is required');
  });

  it('rejects BUY when risk exceeds max threshold', async () => {
    (marketDataRepository.findSymbolByTicker as jest.Mock).mockResolvedValue({
      id: 'sym-1',
      ticker: 'AAPL',
      isActive: true,
    });
    (
      paperTradingRepository.resolveAccountForUser as jest.Mock
    ).mockResolvedValue({
      id: 'acct-1',
      cashBalance: { toNumber: () => 1000 },
    });
    await expect(
      service.placeOrder(
        {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 10,
          stopLossPrice: 90,
          source: 'MANUAL',
        },
        'orders-test@local.test',
      ),
    ).rejects.toThrow('Risk per trade exceeds limit');
  });

  it('returns computed risk fields on valid BUY', async () => {
    (marketDataRepository.findSymbolByTicker as jest.Mock).mockResolvedValue({
      id: 'sym-1',
      ticker: 'AAPL',
      isActive: true,
    });
    const result = await service.placeOrder(
      {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 2,
        stopLossPrice: 98,
        takeProfitPrice: 106,
        source: 'MANUAL',
      },
      'orders-test@local.test',
    );
    expect(result.riskPerShare).toBe(2);
    expect(result.totalRisk).toBe(4);
    expect(result.riskPercent).toBeCloseTo(0.00004);
    expect(result.riskRewardRatio).toBe(3);
  });

  it('provides deterministic stop-loss suggestion', async () => {
    (marketDataService.syncDailyBars as jest.Mock).mockResolvedValue(60);
    (marketDataService.getBars as jest.Mock).mockResolvedValue([
      { low: 101, close: 105 },
      { low: 99, close: 104 },
      { low: 100, close: 103 },
    ]);
    const suggestion = await service.suggestStopLoss('aapl', 2);
    expect(suggestion.symbol).toBe('AAPL');
    expect(suggestion.swingLow).toBe(99);
    expect(suggestion.suggestedStopLoss).toBeCloseTo(98.505);
    expect(suggestion.referencePrice).toBe(103);
    expect(marketDataService.syncDailyBars).toHaveBeenCalled();
  });

  it('caps stop-loss suggestion when swing low is too far below price', async () => {
    (marketDataService.syncDailyBars as jest.Mock).mockResolvedValue(60);
    (marketDataService.getBars as jest.Mock).mockResolvedValue([
      { low: 250, close: 350 },
      { low: 240, close: 349.78 },
      { low: 235, close: 349.78 },
    ]);
    const suggestion = await service.suggestStopLoss('googl', 3);
    expect(suggestion.symbol).toBe('GOOGL');
    expect(suggestion.referencePrice).toBeCloseTo(349.78, 2);
    expect(suggestion.suggestedStopLoss).toBeCloseTo(321.7976, 4);
  });

  it('delegates order level updates to paper trading service', async () => {
    (paperTradingService.updateOrderLevels as jest.Mock).mockResolvedValue({
      orderId: 'ord-1',
      stopLossPrice: 97,
      takeProfitPrice: 108,
    });

    const result = await service.updateOrderLevels(
      'ord-1',
      { stopLossPrice: 97, takeProfitPrice: 108 },
      'orders-test@local.test',
    );

    expect(result.orderId).toBe('ord-1');
    expect(result.stopLossPrice).toBe(97);
    expect(result.takeProfitPrice).toBe(108);
    expect(paperTradingService.updateOrderLevels).toHaveBeenCalledWith(
      'ord-1',
      { stopLossPrice: 97, takeProfitPrice: 108 },
      'orders-test@local.test',
      undefined,
    );
  });
});
